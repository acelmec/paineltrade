# COPY_NT8_GUIDELINES.md — Constituição Operacional e Regras Invioláveis do Copy Trading NT8

Este documento estabelece as **Premissas Fundamentais e Regras de Negócio Invioláveis** do motor de Copy Trading NinjaTrader 8 (`AxionGatewayAddOn.cs`, `ninjaGateway.ts`, `db.ts` e `AppContext.tsx`).

**REGRA PARA AGENTES E DESENVOLVEDORES:** Toda e qualquer alteração no código de execução, gestão de risco, sincronização de ordens ou fechamento de posições DEVE ser avaliada contra este documento antes de ser aplicada, garantindo que **nenhuma** das premissas abaixo seja quebrada ou degradada.

---

## 1. Respeito Absoluto à Gestão de Risco das Contas (Master e Slaves)

Todas as contas (tanto a conta **Master/Emissora** quanto cada conta **Slave/Seguidora**) possuem sua própria gestão de risco individual que deve ser validada em tempo real:

1. **Horários Operacionais (`HorariosOperacionais` / `sessions`):**
   - Operações só são permitidas dentro das janelas de horário configuradas na conta (com precisão de segundos).
   - Tentativas de entrada fora do horário operacional devem ser bloqueadas (na Slave) ou encerradas imediatamente (na Master), gerando aviso na aba de **Mensagens / Rejeições**.
2. **Limite Diário de Operações (`MaxTradesDay` / `max_daily_trades`):**
   - Ao atingir o número máximo de operações permitidas no dia, a conta entra em estado bloqueado para novas entradas até o próximo ciclo/sessão.
3. **Metas Financeiras Diárias (`StopLossDay` e `TakeProfitDay`):**
   - Monitoramento contínuo do PnL Diário (Realizado + Não Realizado).
   - Se a conta atingir o **Limite de Perda Diária (Stop Diário)** ou a **Meta de Ganho Diário (Take Diário)**, todas as posições abertas daquela conta são encerradas imediatamente a mercado, ordens pendentes são canceladas e novas entradas ficam bloqueadas pelo restante da sessão.

---

## 2. Controle Estrito de Lote Máximo (`MaxLots`) — Master e Slave

### A. Na Conta Master (Fechamento Parcial e Ajuste de SL/TP ANTES de Copiar)
* **Proibição de Excesso de Lote na Master:** A conta Master nunca pode manter uma posição aberta com quantidade de contratos superior ao seu limite configurado (`MaxLots`).
* **Fluxo Obrigatório de Ajuste Pré-Cópia:**
  - *Exemplo prático:* O limite da conta Master é de **2 contratos**, mas é aberta uma operação com **3 contratos**.
  1. **Fechamento Parcial Imediato:** Assim que a entrada é detectada na Master, o sistema envia imediatamente uma ordem a mercado (`RiskLotCap`) encerrando **1 contrato** excedente.
  2. **Ajuste Simultâneo de Stop Loss e Take Profit:** As ordens de proteção (Stop Loss e Take Profit) da Master têm sua quantidade reduzida/ajustada em **1 contrato**, ficando alinhadas exatamente em **2 contratos**.
  3. **Confirmação Obrigatória Antes da Cópia:** A ordem **SÓ é enviada para as contas Slaves após a confirmação** de que o lote da Master foi corrigido para o limite permitido (2 contratos) e seus respectivos Stop Loss e Take Profit estão ajustados.
  4. A ordem `RiskLotCap` é marcada internamente (`RegisterCopyOrder`) para que esse ajuste de excesso na Master **não** seja interpretado como uma ordem de saída nas Slaves.

### B. Na Conta Slave (Abertura Direta no Valor Limite)
* **Avaliação pela Gestão da Slave:** Ao receber o comando de cópia da Master (já com o lote confirmado da Master), o sistema calcula o lote proporcional pelo fator da regra:
  $$\text{Lote Calculado} = \text{Arredondar}(\text{Lote Confirmado Master} \times \text{Multiplicador})$$
* **Clamping Direto na Abertura:** Se o $\text{Lote Calculado}$ ultrapassar o limite máximo de contratos (`MaxLots`) configurado na gestão da conta Slave, **a operação na Slave JÁ É ABERTA diretamente com o valor limite máximo da Slave** (e com Stop Loss e Take Profit nesse mesmo valor limite), sem nunca abrir contratos excedentes na Slave.

---

## 3. Proibição Estrita de Operações Master Sem Stop Loss e Take Profit

1. **Bloqueio de Cópia sem Proteção Completa:**
   - Caso seja aberta uma operação na conta Master **sem Stop Loss** ou **sem Take Profit** definidos, a operação **NÃO DEVE ser copiada** para nenhuma conta Slave.
2. **Tolerância de Registro ATM (Polling de Confirmação):**
   - Como o motor ATM do NinjaTrader 8 pode levar alguns milissegundos após o preenchimento da entrada a mercado para submeter as ordens OCO de Stop Loss e Take Profit, o detector aguarda a confirmação das ordens da ATM antes de decidir.
   - Confirmados ambos (`Stop Loss > 0` e `Take Profit > 0`), a cópia segue imediatamente.
   - Se após a janela de confirmação faltar Stop Loss ou Take Profit, a cópia é abortada e uma mensagem detalhada é registrada na aba **Mensagens / Rejeições** (com *debounce* para evitar duplicidade).
3. **Preservação Intacta das Ordens da Master:**
   - O `OnAccountOrderUpdate` **NUNCA** deve cancelar ordens de Stop Loss ou Take Profit recém-criadas pela estratégia ATM da conta Master durante a abertura da posição.

---

## 4. Movimentação Dinâmica de Stop Loss e Take Profit

1. **Sincronização em Tempo Real:**
   - Toda movimentação de Stop Loss ou Take Profit feita na conta Master (seja arrastando a ordem no gráfico do NinjaTrader, via SuperDOM, Break-Even ou Trailing Stop) deve ser replicada imediatamente para todas as contas Slaves ativas.
2. **Integridade do Vínculo OCO e Quantidade:**
   - Ao mover o preço do Stop Loss ou Take Profit na Slave, o sistema preserva o vínculo OCO e a quantidade de contratos aberta na respectiva Slave (respeitando seu multiplicador de lote e seu limite máximo).

---

## 5. Replicação por Fator e Fechamento Correto (Total e Parcial)

1. **Multiplicação de Lote (`LotMultiplier`):**
   - Cada regra de Copy Trading possui seu fator multiplicador (ex: `1.0x`, `2.0x`, `3.0x`, `0.5x`), aplicado sobre o lote efetivo da Master e limitado pelo `MaxLots` da Slave.
2. **Fechamento Total (Master fica `Flat` ou Comando "Zerar Tudo"):**
   - Quando a posição da Master é encerrada totalmente (`MarketPosition.Flat`):
     - **Respeito Estrito à Flag `CloseSlavesOnMasterClose`:** Apenas as Slaves configuradas com **"Zerar c/ Master" ATIVADO** (`CloseSlavesOnMasterClose = true`) são encerradas automaticamente. Contas Slaves com a opção desmarcada (`CloseSlavesOnMasterClose = false`) permanecem abertas no mercado com suas respectivas ordens de Stop Loss e Take Profit 100% ativas no livro.
     - Para as Slaves que devem fechar, o sistema consulta a **quantidade real aberta na conta Slave no NinjaTrader** (`Math.Abs(slavePos.Quantity)` — ex: 4 contratos quando a Master tinha 2 contratos e multiplicador 2x) e envia a ordem de fechamento para **100% dos contratos reais da Slave**, nunca ficando limitado ao lote da Master.
     - Todas as ordens pendentes de proteção (Stop Loss e Take Profit) daquele ativo nas Slaves encerradas são canceladas.
   - O botão de emergência **"Zerar Tudo"** (pânico global) zera todas as contas selecionadas diretamente na corretora independente das regras.
3. **Fechamento Parcial Proporcional:**
   - Quando a Master realiza uma saída parcial (ex: reduz de 2 contratos para 1 contrato):
     - A Slave calcula a quantidade restante esperada:
       $$\text{Restante Esperado Slave} = \min\left(\text{MaxLots}_{\text{Slave}}, \text{Arredondar}(\text{Quantidade Restante Master} \times \text{Multiplicador})\right)$$
     - A quantidade a fechar na Slave é:
       $$\text{Quantidade a Fechar} = \max(0, \text{Quantidade Atual Slave} - \text{Restante Esperado Slave})$$
     - As ordens de Stop Loss e Take Profit remanescentes na Slave têm sua quantidade reconciliada automaticamente para corresponder ao novo saldo de contratos abertos.
4. **Classificação Precisa de Entrada vs. Saída:**
   - A classificação de uma execução na Master (`ENTRADA` vs. `SAÍDA/REDUÇÃO`) deve sempre priorizar a direção real da posição pós-execução (`MarketPosition.Long` com `Buy` = Entrada; `MarketPosition.Short` com `Sell` = Entrada; posição `Flat` ou ordem na direção oposta à posição = Saída).
   - Flags temporárias de *flattening* (`MarkAccountFlattening`) são estritamente medidas em **segundos** (máximo `2.5s`) e limpas imediatamente na abertura de nova posição.

---

## 6. Arquitetura de Cópia e Guardião de 5 Segundos (Ordens a Mercado sem Proteção)

1. **Ordens Pendentes de Entrada Não Replicadas:**
   - Ordens pendentes (Limit, Stop, MIT) da conta Master **NÃO são replicadas** para as contas Slaves enquanto estiverem aguardando no livro. Elas aguardam livremente sem sofrer cancelamento quando a conta estiver Flat.
   - Somente após a ordem da Master entrar a mercado (preenchida / `Filled`), a operação é imediatamente replicada para as Slaves a mercado com seus respectivos Stops e Takes.
2. **Replicação Obrigatória de Stop Loss e Take Profit:**
   - As ordens de Stop Loss e Take Profit enviadas pela conta Master são sempre replicadas compulsoriamente para as contas Slaves na entrada e sincronizadas em tempo real em qualquer movimentação ou ajuste de preço.
3. **Guardião de 5 Segundos para Posições a Mercado Desprotegidas:**
   - Caso uma operação a mercado fique aberta sem Stop Loss e Take Profit ativos por **5 segundos** em qualquer conta (Master, Slave ou Avulsa), o guardião encerra a posição a mercado e cancela ordens residuais automaticamente por segurança institucional.

---

## 7. Checklist de Verificação Antes de Qualquer Commit / Build

Antes de finalizar qualquer modificação relacionada ao Copy Trading ou integração NinjaTrader 8, verifique:
- [ ] Ordens pendentes de entrada na Master aguardam livremente no livro e NÃO são replicadas para as Slaves antes de entrarem a mercado?
- [ ] A abertura de posição com ATM na Master mantém os Stops e Takes intactos e copia imediatamente para as Slaves?
- [ ] A movimentação de Stop Loss e Take Profit na Master move os níveis nas Slaves em tempo real?
- [ ] Se a Master abrir lote acima do seu limite (ex: 3x quando o limite é 2x), ela fecha 1x a mercado, ajusta seu Stop e Take para 2x e **só após confirmar** envia 2x (multiplicado pelo fator) para a Slave?
- [ ] Se o lote copiado para a Slave superar o limite máximo da Slave, a Slave já abre diretamente no seu valor limite?
- [ ] Se a Master abrir posição sem Stop e Take, a cópia para as Slaves é bloqueada e gera registro na aba de Rejeições?
- [ ] O fechamento total e o "Zerar Tudo" encerram 100% dos contratos nas Slaves mesmo quando há multiplicador de lote (ex: 2x, 3x)?
- [ ] Posição a mercado aberta sem Stop Loss e Take Profit em qualquer conta é encerrada pelo Guardião em 5 segundos?
