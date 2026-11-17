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

---

## 12. Constituição de Versionamento e Publicação de Pacotes (`public/`)

Toda e qualquer rotina de salvamento de versões dos pacotes oficiais DEVE seguir estritamente as regras de [`VERSIONING_GUIDELINES.md`](file:///c:/Users/Pichau/Projetos%20React/VortexWeb/VERSIONING_GUIDELINES.md):
1. **Os 3 Pacotes Oficiais de Distribuição:**
   - **Item 1 — Easypanel (Docker Web):** `easypanel-deploy.zip`
   - **Item 2 — Instalador Windows:** `Instalador_AxionTradeStation.exe`
   - **Item 3 — Android APK:** `VortexWeb.apk`
2. **Escopo Estrito de Arquivos:** As pastas de versão devem conter exclusivamente os arquivos acima, sem logs, pastas intermediárias ou código-fonte.
3. **Padrão de Pastas com Contador Diário (`public/V<DDMMAAAA>_<NN>`):** Formato `V<DDMMAAAA>_<NN>` (ex: `public/V16112026_01/`), iniciando sempre em `_01` a cada novo dia e incrementando `_02`, `_03` caso novas versões sejam geradas na mesma data.
4. **Solicitações Coletivas vs. Individuais:**
   - O usuário pode solicitar atualizar as três versões simultaneamente ou pedir qualquer uma individualmente ("Atualizar Easypanel", "Atualizar Instalador Windows" ou "Atualizar Android").
5. **Regra de Ambiguidade Mandatória:** Se a solicitação do usuário for genérica ou não especificar com clareza o que deseja atualizar, o agente DEVE perguntar diretamente qual(is) dos 3 pacotes ele deseja atualizar antes de executar qualquer compilação ou build.

---

## 13. Regra Inviolável de Plotagem para Ativos Oriundos do Banco de Dados Supabase (`AxionDB`)

Toda plotagem de gráfico, linha `BID`/`ASK`, badge de `Spread` e painel da `TradeBoleta` no terminal Axion para **ativos oriundos do banco de dados Supabase** (`isStandardSupabasePanel` / tabela `painelvm_candles_1m` / instâncias `painel_*`) segue uma **regra única e universal** e DEVE obedecer estritamente às diretrizes abaixo (detalhadas em [`CHART_GUIDELINES.md`](file:///c:/Users/Pichau/Projetos%20React/VortexWeb/CHART_GUIDELINES.md)):

1. **Escopo Estrito (Somente Origem Supabase / `AxionDB`):**
   - A conversão de *Close Time* (`dt + 60s`) para *Open Time* (`dt - 60000ms`) e a ancoragem do spread ao preço do painel aplicam-se **exclusivamente** aos ativos oriundos do banco de dados Supabase (`painelvm_candles_1m` em `fetchCandlesSupabase`, `postgres_changes` de `painelvm_candles_1m` e eventos WebSocket `type: 'candle'` / `type: 'market_data'` quando `isStandardSupabasePanel(targetPanel)` for verdadeiro).
   - Ativos de outras origens diretas (Binance, MT4/MT5 direto, cTrader) já operam nativamente em *Open Time* e NUNCA devem sofrer recuo de `-60s`.
2. **Alinhamento Temporal Idêntico ao MetaTrader 4 (Sem Engolir a Vela Fechada Anterior):**
   - Como o coletor `GammaPainelHttpCandles` grava todas as velas M1 com `endDt = dt + 60s` em horário de São Paulo (`-03:00` sem sufixo de fuso), `parseInputToDate` deve interpretar strings ISO sem fuso em `America/Sao_Paulo` (`-03:00`) e subtrair `60000ms` de **todas** as velas de origem Supabase. Isso garante que às `21:53:30` a vela corrente seja `21:53` e a vela fechada imediatamente anterior seja `21:52`, sem jamais sobrescrever ou perder a última vela fechada.
   - É proibido aplicar recuo de `-60s` apenas na última vela de forma isolada.
3. **Plotagem Fiel e Unificada de `BID`, `ASK` e `SPREAD` (`src/utils/realQuote.ts`):**
   - O indicador `Price Line BID ASK` (tanto nas etiquetas de eixo quanto nas linhas parciais em canvas 2D e linhas completas), o badge de `Spread` e a `TradeBoleta` devem plotar **somente** valores provenientes do banco de dados, WebSocket ou API (`resolveDisplayQuote`).
   - Em caso de falha ou ausência de leitura de `ask`, deve permanecer **sempre a última diferença real conhecida** (`getLastRealSpread` / `rememberRealSpread`). É terminantemente proibido atribuir `0.25` (`tickSize`) como spread padrão.
   - Nos ativos `AxionDB`, a diferença real `(ask - bid)` da fonte é aplicada sobre o preço próprio do painel (`bid = panelPrice`, `ask = panelPrice + realSpread`), mantendo a linha `BID` alinhada ao fechamento do candle do ativo e a linha `ASK` na distância exata do spread real.
   - Toda atualização de cotação/tick deve validar a coerência de escala (diferença `<= 5%` em relação ao fechamento do último candle do gráfico) e acionar o redesenho imediato do canvas sobreposto (`updateLevelLabelsRef.current?.()`) para que as linhas parciais `BID`/`ASK` sejam sempre visíveis na escala do ativo.
4. **Isolamento Estrito de Identificação de Ativos (Prevenção de Colisão de Substrings):**
   - Em todas as funções de roteamento e compatibilidade de ativos (`isSameAsset`, `extractRoot`, `isTickMatchingPanel`, `isMarketDataCompatibleWithPanel`, `resolvePanelTickSize`, `resolvePanelPointValue`), é proibido executar `.includes()` bruto antes da normalização de raiz (`extractRoot`).
   - A verificação do **Dow Jones** (`DOW`, `YM`, `MYM`, `US30`, `USAIND`, `DJ30`, `painel_us30_web`) DEVE obrigatoriamente preceder a verificação do **S&P 500** (`ES`, `MES`, `SP500`, `USA500`, `painel_sp500_web`), pois a string `"DOWJONES"` termina com as letras `"ES"`. Isso impede que pacotes ou cotações do `SP500` (`~7449.00`) contaminem o painel ou desloquem as linhas `BID`/`ASK` do `DOWJONES` (`~51600`).

---

## 14. Constituição de Plotagem Gráfica e Sincronização Ponta a Ponta MetaTrader 4 / MetaTrader 5 (`AxionGatewayEA.mq4` / `AxionGatewayEA.mq5`)

Toda operação de gráficos, cotações em tempo real, contas, posições abertas e histórico de trades para ativos e contas do ecossistema **MetaTrader 4 e MetaTrader 5** (`ecosystem: 'mt'`, `AxionGatewayEA.mq4` e `AxionGatewayEA.mq5`) DEVE seguir estritamente as diretrizes abaixo:

### A. Plotagem Simples, Direta e de Baixa Latência dos Gráficos MT4/MT5
1. **Carregamento Único do Histórico Fechado (`shouldFetchCandles` em `AppContext.tsx`):**
   - Ao abrir o gráfico de um ativo sincronizado via MT4/MT5 (ou quando o usuário alterar explicitamente o período `3d`, `7d`, `15d`, `30d`), o sistema busca o histórico disponível do ativo **uma única vez** (`fetchCandlesSupabase` / `/market_candles`), plota os candles fechados consolidados e, **daí para frente, atualiza exclusivamente o candle corrente** com os ticks em tempo real do MetaTrader.
   - **Proibição de Fontes Externas Arbitrárias:** É terminantemente proibido aplicar comparativos, recortes ou substituições com Yahoo Finance, bem como desviar ativos cripto do MetaTrader (`BTCUSD - ActivTrades`, `ETHUSD - ActivTrades`) para a API da Binance (`!isPanelMt` em `isCryptoAsset`).
2. **Alinhamento Estrito 1-para-1 entre Ativo e Contrato (`marketSource.ts` e `findMtQuoteForAsset`):**
   - Cada painel MT4/MT5 deve ser alimentado por um único contrato canônico compatível com a escala do seu histórico (`USTEC -> USATECDEC26`, `US500 -> USA500DEC26`, `US30 -> USAIND*`, `US2000 -> USARUS*`, `XAUUSD -> GOLD`, `USOIL -> LCRUDE*`, `BTCUSD -> BTCUSD`, `ETHUSD -> ETHUSD`), impedindo que cotações de contratos diferentes (ex.: `UsaTec` contínuo vs `UsaTecDec26` futuro) disputem o mesmo gráfico.
3. **Atualização em Tempo Real (`<1ms` a `150ms`) sem Piscadas ou Atrasos:**
   - **WebSocket Desbloqueado (`ws.onmessage`):** Pacotes `type: 'market_data'` recebidos via WebSocket da VPS/Gateway (`source: 'mt4'`) disparam imediatamente `vortex_streamer_tick` (`<5ms`) e atualizam `remoteMtQuotesRef.current`.
   - **Loop Rápido Dedicado `/quotes` (`150ms`):** A leitura HTTP de `/quotes` roda em um Web Worker dedicado a cada `150ms` (`fetchFastMtQuotes`), totalmente desacoplada da sincronização de conta/histórico (`mt4_sync_*` a cada `800ms`), impedindo filas de 1 a 2 segundos.
   - **Proibição de Ticks a partir de Snapshots Cacheados:** `processMtSyncSnapshot` NUNCA deve despachar `vortex_streamer_tick` a partir de `snap.symbol` ou `snap.quotes` de `mt4_sync_all` / `mt4_sync_<conta>`, evitando que cotações antigas cacheadas no servidor pisquem contra o feed em tempo real `/quotes`.
   - **Atualização Direta da Barra Corrente (`CandleChart.tsx`):** O listener `handleLiveStreamerTick` atualiza em `<1ms` tanto as linhas `BID`/`ASK`/`LAST` quanto o próprio corpo da vela em formação (`candleSeriesRef.current.update(...)`, referenciada pelo menor preço `BID`), sem aguardar re-renderizações da árvore React.

### B. Sincronização Ponta a Ponta (Bidirecional) de Contas, Operações Abertas e Histórico
1. **Sincronização Automática de Conta (`Balance`, `Equity`, `Currency`, `Broker`):**
   - O `AxionGatewayEA` transmite continuamente o saldo real (`AccountBalance`), patrimônio líquido (`AccountEquity`), moeda e corretora da conta conectada.
   - O Axion atualiza em tempo real o card da conta na Gestão de Contas e no cabeçalho, ajustando automaticamente `initial_balance`, `high_watermark` e `eod_baseline_balance` quando detecta o vínculo inicial da conta real/demo.
2. **Operações Abertas no MT4/MT5 Exibidas Dentro do Axion (`syncRemoteMtPositions`):**
   - Qualquer posição aberta diretamente no terminal MetaTrader 4 ou MetaTrader 5 (seja manual no MT4/MT5 ou via outro EA) é espelhada automaticamente no Axion com status `"Em Andamento"`, contendo `ticket`, `symbol`, `side` (`COMPRA`/`VENDA`), `lots`, `entry_price`, `stop_loss`, `take_profit` e `pnl_liquido` real (`profit + commission + swap`).
   - As linhas visuais de Entrada, Stop Loss e Take Profit são plotadas no gráfico do ativo no Axion.
   - Alterações de SL/TP ou o encerramento da ordem no MT4/MT5 (por Take Profit, Stop Loss ou fechamento manual) atualizam ou encerram imediatamente a operação no Axion (`Gain` ou `Stop` com o preço real de saída e PnL líquido) e replicam o fechamento para eventuais contas Slaves.
3. **Operações Abertas no Axion Enviadas/Copiadas para o MT4/MT5 (`dispatchMtGatewayCommand` / `/commands`):**
   - Ordens disparadas pela `TradeBoleta`, por Robôs/Estratégias (`AlgorithmBuilder`) ou por Copy Trading no Axion são enviadas instantaneamente para a fila `/commands` da conta MT4/MT5 (`open`, `modify`, `close`, `flatten_all`).
   - O `AxionGatewayEA` consome e executa o comando no `OnTimer()` (`100ms–150ms`) usando `ResolveBrokerSymbol` (mapeando automaticamente nomes como `USTEC`, `US500`, `BTCUSD`, `ETHUSD` para o símbolo exato da corretora).
   - Assim que o MetaTrader abre a posição e retorna o `ticket`, o Axion vincula o registro local ao `ticket` oficial do MT4/MT5 sem duplicar ordens e aplica em tempo real a governança de risco da conta (Stop Diário, Meta Diária e Drawdown Máximo, disparando `flatten_all` caso violado).
4. **Sincronização Completa e Unificada do Histórico de Operações (`syncRemoteMtTrades`):**
   - O histórico do Axion (`StrategyReport` / Relatório de Performance) sincroniza e exibe de forma completa **tanto as operações abertas pelo próprio Axion quanto todas as operações já realizadas que constam no histórico do MetaTrader** (`OrdersHistoryTotal` no MT4 / `HistoryDealsTotal` no MT5).
   - Cada trade fechado no MetaTrader recebe identificação determinística por conta e ticket (`mt_<account>_<ticket>`), preservando preço de entrada, preço de saída, lote, horários de abertura/fechamento e PnL líquido exato (`profit + commission + swap`), garantindo fidelidade contábil 100% idêntica ao relatório da corretora.







