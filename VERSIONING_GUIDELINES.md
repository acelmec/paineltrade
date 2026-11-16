# Diretrizes de Versionamento e Publicação de Pacotes (`public/`)

Este documento estabelece o protocolo oficial e obrigatório para o salvamento, organização e versionamento dos três pacotes de distribuição do ecossistema **VortexWeb** dentro do diretório `public/`.

---

## 1. Os 3 Pacotes Oficiais de Distribuição

Toda entrega de versão é composta estritamente por até **três arquivos oficiais**. Não deve ser incluído nenhum arquivo intermediário, log, código-fonte solto ou temporário.

| Item | Pacote / Plataforma | Nome Exato do Arquivo | Comando de Geração / Origem |
| :---: | :--- | :--- | :--- |
| **1** | **Easypanel (Docker Web)** | `easypanel-deploy.zip` | `npm run easypanel:pack` (`scripts/packEasypanel.cjs`) |
| **2** | **Instalador Windows** | `Instalador_AxionTradeStation.exe` | `npm run installer:build` (`publish-output/`) |
| **3** | **Android APK** | `VortexWeb.apk` | `npm run apk:release` (`scripts/buildApk.cjs`) |

> [!IMPORTANT]
> **Escopo Estrito de Arquivos:**  
> Nas pastas de versão pública, é estritamente proibido salvar arquivos além dos 3 listados acima. A pasta deve conter exclusivamente:
> 1. `easypanel-deploy.zip`
> 2. `Instalador_AxionTradeStation.exe`
> 3. `VortexWeb.apk`

---

## 2. Padrão de Nomenclatura e Contador de Versão por Pasta

Todas as versões são organizadas em subpastas dentro de `public/` seguindo a máscara:

$$\text{public/V}\mathbf{DDMMAAAA}\_\mathbf{NN}$$

Onde:
* **`V`**: Prefixo obrigatório maiúsculo indicando pasta de versão.
* **`DDMMAAAA`**: Data do dia do salvamento com 8 dígitos (Dia, Mês e Ano).  
  * *Exemplo:* 16 de Novembro de 2026 $\rightarrow$ `16112026`.
* **`_NN`**: Contador sequencial diário com 2 dígitos, iniciando sempre em `_01`.

### Exemplos Práticos de Ciclo de Vida:
* **Dia 16/11/2026:**
  * 1ª versão gerada no dia: `public/V16112026_01/`
  * Se for solicitada uma 2ª versão no mesmo dia: abre nova pasta `public/V16112026_02/`
  * Se houver uma 3ª versão: abre nova pasta `public/V16112026_03/`
* **Dia 17/11/2026 (virada de data):**
  * 1ª versão gerada no novo dia: reseta o contador e cria `public/V17112026_01/`
  * 2ª versão do dia 17: `public/V17112026_02/`

---

## 3. Tipos de Solicitação e Comportamento Operacional

O usuário pode acionar a geração de versões de duas formas: **Coletiva (as 3 versões juntas)** ou **Individual (apenas um dos pacotes)**.

### A. Solicitação Coletiva ("Atualizar as 3 versões" / "Gere novos 3 arquivos")
1. Compila e empacota os 3 artefatos:
   - Easypanel (`npm run easypanel:pack`)
   - Instalador Windows (`npm run installer:build`)
   - Android APK (`npm run apk:release`)
2. Localiza ou cria a próxima pasta do dia `public/V<DDMMAAAA>_<NN>/`.
3. Salva os 3 arquivos atualizados dentro da nova pasta.
4. Fornece ao usuário os links clicáveis diretos (`file:///...`) dos 3 arquivos.

### B. Solicitação Individual ("Atualizar Easypanel", "Atualizar Windows" ou "Atualizar Android")
1. O usuário pode pedir para atualizar apenas um componente específico:
   - *"Atualizar Easypanel"* $\rightarrow$ Compila e gera apenas `easypanel-deploy.zip`.
   - *"Atualizar Instalador Windows"* $\rightarrow$ Compila e gera apenas `Instalador_AxionTradeStation.exe`.
   - *"Atualizar Android"* $\rightarrow$ Compila e gera apenas `VortexWeb.apk`.
2. Cria a nova pasta sequencial do dia (ex: `V16112026_02/`).
3. Copia o arquivo recém-compilado para a nova pasta e preserva/reaproveita os outros dois pacotes estáveis da versão imediatamente anterior para que a pasta permaneça completa com os 3 arquivos prontos para download.
4. Apresenta o link clicável direto do pacote atualizado.

---

## 4. Regra de Ambiguidade Mandatória (Confirmação Prévia)

> [!WARNING]
> **Se o pedido do usuário for ambíguo ou genérico:**  
> Caso o usuário diga algo genérico como *"atualize aí"*, *"gere nova versão"*, *"salve a versão"* sem especificar se deseja os 3 pacotes ou apenas um específico, o Agente de IA ou desenvolvedor **NÃO DEVE adivinhar nem disparar builds desnecessários**.
>
> Deve **obrigatoriamente perguntar** ao usuário antes de iniciar:
> *"Você deseja atualizar os 3 pacotes juntos (Easypanel, Instalador Windows e Android) ou algum deles individualmente (1. Easypanel, 2. Instalador Windows, 3. Android)?"*

---

## 5. Script de Automação de Versionamento

Para garantir que a contagem de pastas e as cópias ocorram sem erro humano, utilize o script automatizado:

```bash
# Atualiza e salva os 3 pacotes na próxima pasta do dia:
node scripts/manageVersions.cjs all

# Ou individualmente:
node scripts/manageVersions.cjs easypanel
node scripts/manageVersions.cjs windows
node scripts/manageVersions.cjs android
```

### O que o script realiza automaticamente:
1. Lê o dia corrente e formata `DDMMAAAA`.
2. Varre a pasta `public/` e descobre o próximo número sequencial `_NN`.
3. Cria a nova pasta `public/V<DDMMAAAA>_<NN>/`.
4. Transfere os arquivos válidos para dentro da pasta.
5. Imprime o resumo com tamanhos e os links clicáveis formatados com forward slashes (`file:///`).
