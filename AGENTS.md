# VortexWeb — Memória Arquitetural, Conceitos Estruturais e Regras Invioláveis

Este documento serve como a **Memória Permanente do Sistema** e a **Constituição de Desenvolvimento do VortexWeb**. Qualquer Agente de IA, desenvolvedor ou processo de automação que atue neste projeto DEVE consultar, respeitar e preservar estes conceitos fundamentais antes de propor ou executar qualquer modificação de código.

---

## 1. Princípio da Disponibilidade Ininterrupta e Não-Degradação (Liveness & Performance)
* **Execução em Tempo Real Não-Degradável:** O sistema Vortex é uma plataforma analítica e operacional de alta precisão. Suas funções e loops de monitoramento **NUNCA podem reduzir sua frequência, entrar em suspensão, ser pausadas ou congeladas** por motivos de:
  - Janela do navegador minimizada ou aba em segundo plano (*background throttling* do Chrome/Edge/Brave).
  - Políticas do navegador de economia de bateria/memória.
  - Perda de foco de tela ou navegação entre abas internas.
* **Mecanismos Mandatórios de Background:**
  - Todo ciclo crítico de mercado, análise de indicadores e robôs DEVE ser mantido através de threads de **Web Worker** (`createWorkerInterval`), que operam fora da fila de timers do DOM e não sofrem *throttling* do Chromium.
  - O sistema mantém sinal de keep-alive ativo (`enableBackgroundAudioKeepAlive`) para evitar a suspensão da aba pelo sistema operacional.

---

## 2. Conceito Estrutural de Algoritmos e Robôs: Indicador vs. Estratégia

O motor de algoritmos dinâmicos do Vortex (`AlgorithmBuilder` e `AppContext`) opera sob dois pilares com comportamentos e regras de negócio totalmente distintos:

### A. Modo INDICADOR (`action: 'alert'`)
* **Objetivo:** Análise técnica, identificação de padrões e emissão de alertas visuais e sonoros no gráfico e via Telegram.
* **Comportamento Operacional:**
  - **Não executa ordens na corretora** e não cria posições com contratos/lotes na gestão de ordens.
  - **Sinais Livres e Sem Bloqueios de Risco:** Não consome o limite diário de trades da conta, não é travado por operações "Em Andamento" de outros robôs e não sofre bloqueio por regras de Stop Diário/Meta de Saldo.
  - Pode disparar avisos e marcadores visuais no gráfico livremente para as contas ativas conectadas.

### B. Modo ESTRATÉGIA (`action: 'position'`)
* **Objetivo:** Execução autônoma de ordens de compra e venda na conta da corretora ou mesa proprietária.
* **Governança Rigorosa de Risco:** TODA estratégia com ação de abertura de posição DEVE obrigatoriamente validar e respeitar as camadas de gestão antes do envio da ordem:
  1. **Limite Diário de Operações do Robô:** `max_daily_trades` / `max_entries` por ciclo diário.
  2. **Gestão de Risco Global da Conta:** `checkOperationalLimits` (Limite de perda diária, meta de ganho atingida, saldo mínimo).
  3. **Regra de Posição Única por Ativo:** Se a conta já possui uma operação "Em Andamento" no mesmo ativo/painel, novas ordens devem ser bloqueadas.
  4. **Controle de Múltiplos Sinais (`allow_multi_signals`):** Se a conta não permitir múltiplos sinais simultâneos, nenhuma nova ordem pode abrir enquanto houver qualquer posição aberta.
  5. **Janelas Operacionais (`sessions`):** Validação estrita dos horários permitidos configurados no robô (com precisão de segundos).
  6. **Controle de Concorrência e Semáforos:** Todo registro de ordem DEVE utilizar semáforos (`pendingSignalInsertsRef`) com liberação **obrigatória em bloco `finally`**, impedindo deadlocks na memória.

---

## 3. Vínculo Obrigatório com Contas (Account Binding)

* **Regra de Ativação:** Nenhum algoritmo autônomo (seja do tipo *Indicador* ou *Estratégia*) roda no "vácuo". Ele **SOMENTE é considerado ativo e executará seus cálculos se estiver explicitamente vinculado a pelo menos uma Conta ATIVA** configurada na Gestão de Contas (seja vinculação direta como Robô ou indireta via gatilho de Prompt IA).
* **Sem Contas Ativas Vinculadas:** O algoritmo permanece em repouso e não processa ordens nem consome recursos da aplicação.

---

## 4. Modos de Execução Temporal: Barra Fechada vs. Barra Corrente

O Vortex suporta dois modos fundamentais de leitura de tempo:

### A. Modo Barra Fechada (`execution_mode: 'closed'`)
* **Conceito:** A decisão e a execução ocorrem estritamente com base no **candle anterior consolidado** (`targetCandle = length - 2`).
* **Regra de Disparo:** A avaliação ocorre no exato instante em que uma nova vela é detectada. O controle de execução DEVE ser atrelado ao **timestamp único da vela consolidada** (`closedEvalKey`), garantindo exatamente **uma única avaliação/disparo por vela fechada**, sem bloqueios por timers de relógio (cooldowns arbitrários) que possam pular o candle seguinte.

### B. Modo Barra Corrente (`execution_mode: 'realtime'`)
* **Conceito:** A decisão ocorre em tempo real sobre a **vela em formação** (`targetCandle = length - 1`) com o preço de mercado atual.
* **Regra de Disparo:** Requer cooldown temporal (ex: 60s) para evitar que oscilações intradiárias no mesmo candle disparem ordens repetidas de forma descontrolada.

---

## 5. Lógica de Condições: Cruzamento vs. Nível Relacional

* **Operadores de Cruzamento (`cross_above` / `cross_below`):**
  - Significam a **transição de estado** na barra: `A atual > B atual E A anterior <= B anterior`.
  - Disparam **exclusivamente na barra exata do cruzamento**. Não devem disparar nas barras subsequentes mesmo que A > B.
* **Operadores Relacionais de Nível (`>` / `<` / `>=` / `<=`):**
  - Significam que a condição é verdadeira **em todas as barras** enquanto o nível for mantido (ex: filtro de tendência onde SMA8 > SMA20).

---

## 6. Integridade do Motor Gráfico e Alimentação de Dados (Lightweight Charts)

Toda manipulação de dados de mercado (Candles, Ticks, Feeds), Indicadores Técnicos e Renderização com o **TradingView Lightweight Charts** DEVE seguir estritamente as regras de [`CHART_GUIDELINES.md`](file:///c:/Users/Pichau/Projetos%20React/VortexWeb/CHART_GUIDELINES.md):
1. **Universal Candle Sanitizer (`cleanAndSanitizeCandles`):** Todo feed (Supabase, Streamer Local NT8, Replay) DEVE passar pela higienização que descarta valores `<= 0`, `NaN`, `null`, aberrações >35% da mediana e pavios fantasmas (>80 pts / >1.5%).
2. **Higienização de Séries de Linha (`sanitizeLineSeriesData`):** Séries de indicadores (SMA, EMA, RSI, MACD, Waddah, Time Heatmap) DEVEM receber objetos estritamente limpos `{ time, value, color? }` em ordem temporal estritamente crescente.
3. **Limpeza Mandatória de Séries Desativadas (`setData([])`):** NUNCA deixar séries de linha órfãs. Se o indicador estiver desativado ou sem dados, DEVE executar `series.setData([])` para evitar o erro `Value is null` em `SeriesBarColorer.Line` durante a movimentação do mouse (`hitTest`).
4. **Guards de Escala de Preço (`priceScale`):** NUNCA chamar `setMarkers` ou calcular coordenadas antes de `chartData.length > 0` e da escala de preço estar consolidada.

---

## 7. Governança e Regras de Modificação de Código para o Agente

1. **Proibição de Degradação:** O agente NUNCA deve simplificar, remover ou contornar as camadas de segurança (Web Workers, semáforos em `finally`, travas de risco de conta, limites operacionais, higienizadores de gráfico).
2. **Preservação dos Conceitos Estruturais:** Qualquer melhoria ou refatoração DEVE se adaptar e respeitar os pilares deste documento (Indicador vs Estratégia, Barra Fechada vs Realtime, Vínculo com Contas, Integridade Gráfica).
3. **Validação Obrigatória de Compilação:** Toda alteração de código DEVE ser validada pelo comando de build do projeto (`npm run build` / `tsc -b && vite build`) garantindo que nenhum erro de tipagem ou quebra de módulo chegue à produção.

---

## 8. Constituição Operacional do Motor Copy Trading NinjaTrader 8 (CopyNT8)

Toda e qualquer modificação relacionada ao Copy Trading entre contas NinjaTrader 8 (`AxionGatewayAddOn.cs`, `ninjaGateway.ts`, `db.ts`, `AppContext.tsx`) DEVE seguir estritamente as regras de [`COPY_NT8_GUIDELINES.md`](file:///c:/Users/Pichau/Projetos%20React/VortexWeb/COPY_NT8_GUIDELINES.md):
1. **Gestão de Risco Estrita em Master e Slaves:** Validação em tempo real de horários operacionais, limites diários de trades e metas diárias (Stop Diário / Take Diário).
2. **Controle de Lote Máximo Pré-Cópia (`MaxLots`):** Se a Master abrir lote acima do limite (ex: limite 2, abriu 3), encerra imediatamente 1 contrato a mercado, ajusta o Stop Loss e Take Profit da Master para 2 contratos e **somente após a confirmação** do lote correto na Master envia para as Slaves. Na Slave, a ordem já abre diretamente no valor limite da Slave caso o cálculo proporcional exceda seu limite.
3. **Proibição de Cópia sem Stop Loss e Take Profit:** Operações na Master sem Stop Loss e Take Profit nunca são copiadas para as Slaves e geram registro na aba Rejeições.
4. **Movimentação Dinâmica de Stops e Takes:** Toda alteração de preço de SL/TP na Master é sincronizada em tempo real para as Slaves.
5. **Fechamento Total e Parcial Proporcional:** Zeragem total encerra 100% dos contratos das Slaves (respeitando multiplicadores de lote 2x, 3x) e saídas parciais ajustam proporcionalmente.
6. **Guardião de 5 Segundos:** Posições a mercado abertas sem Stop Loss e Take Profit em qualquer conta são encerradas pelo Guardião após 5 segundos; ordens pendentes de entrada aguardam livremente no livro e só são replicadas para Slaves após entrarem a mercado.

---

## 9. Constituição Operacional do Replay de Mercado (ReplayEngine)

Toda e qualquer modificação relacionada ao Replay de Mercado (`ReplayWorkstation.tsx`, `ReplayControlCard.tsx`, `replayEngine.ts`, `db.ts`, `vortexStreamer.ts`) DEVE seguir estritamente as regras de [`REPLAY_GUIDELINES.md`](file:///c:/Users/Pichau/Projetos%20React/VortexWeb/REPLAY_GUIDELINES.md):
1. **Preservação de Processos Estáveis:** O Replay funciona de forma validada; novas implementações NUNCA devem quebrar a mecânica de execução de ordens simuladas, ATM, tick-by-tick fractal e cálculo de PnL.
2. **Paginação Supabase com Bloco Máximo de 1.000 Linhas (`chunkSize <= 1000`):** Respeito mandatório ao teto do PostgREST (`db_max_rows = 1000`) para impedir salto ou perda de velas históricas.
3. **Preservação Obrigatória do Intervalo Selecionado pelo Usuário:** NUNCA resetar arbitrariamente as datas `startDate` e `endDate` para "últimos 2 dias" caso estejam dentro dos limites válidos do banco.
4. **Exibição Gráfica Ampla:** Proibição de truncar `displayedCandles` para janelas pequenas (como 800 velas), garantindo visibilidade total do período carregado (até 15.000+ velas) para análise técnica completa.
5. **Compatibilidade Universal de Timestamps:** Tratamento bidirecional de timestamps com e sem sufixo UTC `Z` para interoperabilidade plena entre Add-on NinjaTrader 8 e Supabase.

---

## 10. Constituição do Axion Streamer Local & Estratégia Multiplataforma (Web, Windows .exe, Android)

Toda e qualquer modificação no fluxo de transmissão local do NinjaTrader 8, estratégias de cache e empacotamento do sistema DEVE seguir estritamente as seguintes diretrizes:

1. **WebSocket Nativo no NinjaTrader 8 (Zero Instalação Adicional):**
   - O `AxionStreamerAddOn.cs` roda 100% dentro do processo do NinjaTrader 8 (`NinjaTrader.exe`).
   - Utiliza as bibliotecas nativas `System.Net.HttpListener` e `System.Net.WebSockets` na porta local `8002`.
   - **É estritamente proibido** exigir a instalação de serviços do Windows (Windows Services), daemons em segundo plano ou executáveis intermediários no PC do trader para transmissão de dados do NT8. O ciclo de vida do servidor deve iniciar e encerrar conjuntamente com o próprio NinjaTrader.
2. **Push de Dados em Tempo Real (<1ms):**
   - O NinjaTrader deve realizar o envio em tempo real (*push*) de candles de 1m, cotação e agressões via canal WebSocket, eliminando o consumo desnecessário de CPU com polling contínuo via HTTP.
   - Os endpoints HTTP de candles (`/candles`) devem suportar parâmetros de corte (`count` e `since`) para evitar transferência desnecessária de históricos volumosos.
3. **Estratégia de Cache e Persistência por Plataforma:**
   - **Web Browser (Navegador):** Cliente leve. O navegador NUNCA deve criar bancos de dados volumosos em disco/memória (IndexedDB) para histórico de velas a fim de evitar degradação por Garbage Collection (GC) e congelamento de abas. O acesso web consulta dados sob demanda com fallback transparente para o Supabase ou NT8 local quando ativo.
   - **Windows (.exe) & Android (APK):** Armazenamento local persistente em banco de dados nativo (SQLite) no disco/armazenamento do dispositivo, permitindo cache definitivo de velas históricas, delta-sync instantâneo e funcionamento fluido offline.
4. **Governança de Empacotamento e Publicação Multiplataforma:**
   - **Easypanel / Docker Web (`npm run easypanel:pack`):** Mandatório executar compilação prévia (`npm run build`), garantindo que o diretório `dist/` esteja atualizado, preservando os arquivos zip dos Add-Ons (`AxionGatewayAddOn.zip`, `AxionStreamerAddOn.zip`) para download pelo usuário, juntamente com `Dockerfile.easypanel`, `nginx.conf`, `docker-start.sh` e `src/backgroundWorker.js`.
   - **Instalador Windows (`npm run installer:build` / `npm run win:exe`):** Compila o frontend atualizado para `dist/`, compacta em `wwwroot.zip`, compila o runtime .NET 8 com WebView2 e gera o executável standalone do instalador.
   - **Android APK (`npm run apk:release`):** Executa sincronização com Capacitor (`cap:sync`) garantindo que os assets embutidos em `android/app/src/main/assets/public/` reflitam com precisão a versão mais recente da interface.

---

## 11. Arquitetura de Ativos vs. Painéis e Unificação de Configurações (Asset-Centric Architecture)

Toda e qualquer manutenção em cadastro de dados de mercado, alertas e configurações de sistema DEVE respeitar a seguinte separação conceitual e técnica:

1. **Equivalência Semântica `panel_id` = Ativo:**
   - Historicamente o sistema utilizava o conceito de "Painéis". Com a evolução para a interface Multi-Chart (`TradeChartGrid`), as entidades `panels`, `painelvm_panels` e o identificador técnico `panel_id` representam na prática os **ATIVOS** do sistema (ex: NQ, GOLD, ES, B3).
   - O identificador `panel_id` é preservado rigorosamente nas tabelas, rotas e estados para manter total compatibilidade com Robôs (`AlgorithmBuilder`), Prompts de IA, Replay e dados históricos.
2. **Configurações Gerais de Sistema (Globais / `'all'`):**
   - As abas de configurações de sistema — **Geral, IA & Voz, Recursos, Fontes/Transmissão, Telegram, Notícias e Regras Gerais de Sinais Manuais** (modo de dimensionamento, confirmação, risco USD) — são **GLOBAIS**.
   - Toda alteração nestas abas é salva com escopo `'all'` (`saveSettings(fields, 'all')`), unificando o comportamento da plataforma independentemente de qual ativo esteja sendo visualizado.
3. **Configurações Granulares por Ativo (`panel_id`):**
   - São estritamente atreladas a cada Ativo (`panel_id`):
     - **Alertas Técnicos (`alert_*`):** Limites e gatilhos de Sentimento, Block Trades, Delta/Ratio, Acelerômetro, Níveis, Força/Viés e PVA. Cada ativo possui no máximo uma regra por tipo de alerta, preservando a coerência do Modo Individual e do Modo Lógica.
     - **Metadados de Mercado:** Símbolo, `instance_id`, `tick_size`, `point_value`.
     - **Sugestões de Stop Loss e Take Profit da Boleta:** Cadastradas no Admin e carregadas como padrão inicial na boleta de cada ativo.
4. **Governança de Alertas em Segundo Plano:**
   - O loop de monitoramento contínuo em Web Worker deve iterar sobre todos os ativos que possuam alertas ativos habilitados (`allSettings[panel.id]`), garantindo disparo sonoro/visual/Telegram ininterrupto mesmo quando o usuário estiver operando outro gráfico na tela.




