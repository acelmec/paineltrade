import { extractSpokenSummary } from './tts';

export interface AIRequestData {
  provider: 'groq' | 'gemini' | 'openai';
  apiKey: string;
  model: string;
  symbol: string;
  price: string;
  zScore: number;
  atrRatio: number;
  sentiment: number;
  macroSentiment?: number;
  microSentiment?: number;
  estado?: string;
  delta: number;
  deltaRatio: number;
  prints: number;
  forces: { symbol: string; buy: number; sell: number }[];
  macroIndexes?: { [symbol: string]: { buy: number; sell: number; description?: string } };
  stocksM7?: { [symbol: string]: { buy: number; sell: number; description?: string } };
  volumeProfile?: {
    vpoc?: number;
    vah?: number;
    val?: number;
    nakedPocs?: Array<{ price: number; dateStr?: string }>;
    hvnBlocks?: Array<{ rank: number; priceCenter: number; priceTop: number; priceBottom: number }>;
  };
  sizingManagement?: {
    mode: 'lote' | 'risco';
    riskUsd?: number;
    pointValue?: number;
    fixedContracts?: number;
  };
  currentPosition?: {
    side: 'COMPRA' | 'VENDA';
    entryPrice: number;
    currentProfit: number;
    currentPrice: number;
    stopLoss: number;
    takeProfit: number;
    durationMinutes: number;
    contracts: number;
  };
  priceActionCandles?: {
    currentCandle: { direction: 'ALTA' | 'BAIXA' | 'DOJI'; bodyPts: number; upperWickPts: number; lowerWickPts: number; volumeRatio: number };
    recentCandles: Array<{ index: number; direction: 'ALTA' | 'BAIXA' | 'DOJI'; bodyPts: number; upperWickPts: number; lowerWickPts: number }>;
    movingAveragesSummary?: string;
    volatilityTrend?: string;
  };
  activeChartIndicators?: Array<{
    name: string;
    type: string;
    valueSummary: string;
    interpretation?: string;
  }>;
  lastClosedTrade?: {
    status: 'Gain' | 'Stop' | 'Cancelado';
    side: 'COMPRA' | 'VENDA';
    entryPrice: number;
    exitPrice: number;
    pointsResult: number;
    closedMinutesAgo: number;
    consecutiveStopsCount?: number;
  };
  userMessage?: string;
  blockTrades: string[];
  news: string[];
  levels: { [key: string]: string };
  screenshotBase64?: string; // Imagem do gráfico em base64 se disponível
  promptTemplate?: string;
  gammaBias?: {
    buyStrength?: number;
    sellStrength?: number;
    gammaBias?: string;
    biasScore?: number;
    nearestResistance?: number;
    nearestSupport?: number;
    distanceToResistance?: number;
    distanceToSupport?: number;
    confluenceType?: string;
    recommendedStrategy?: string;
    voidGammaAbove?: number;
    voidGammaBelow?: number;
    biasTimestamp?: string;
  };
  activeCardsData?: {
    panelModeLabel?: string;
    isPanel1?: boolean;
    activeCardNames: string[];
    coreAnalytics?: {
      analyticsQqqPct: number;
      marketStructureQqqPct: number;
      marketStructureSpyPct: number;
      aiStatus?: string;
    };
    anchors?: {
      spyPct: number;
      spySignal: string;
      qqqPct: number;
      qqqSignal: string;
    };
    flowAndExposure?: {
      rhoIndexPct: number;
      tailRiskPct: number;
      volatilitySmileQqqPct: number;
      volatilitySmileSpyPct: number;
      netGammaPct: number;
    };
    stockReplacement?: {
      symbol: string;
      callPct: number;
      callSignal: string;
      putPct: number;
      putSignal: string;
    };
  };
  activeWidgetsData?: Array<{
    id: string;
    type: string;
    title: string;
    summary: string;
    dataJSON?: any;
  }>;
  panelModeLabel?: string;
  isPanel1?: boolean;
}

export interface AIResponse {
  success: boolean;
  sinal: 'COMPRA' | 'VENDA' | 'SAIR' | 'AGUARDANDO';
  confianca: string; // Ex: "85%"
  alvo: string;
  stop: string;
  resumo: string;
  gatilho?: string;
  alerta?: string;
  copilotThought?: string;
  tradeAction?: 'OPEN' | 'HOLD' | 'TRAIL_STOP' | 'BREAK_EVEN' | 'CLOSE';
  suggestedStopUpdate?: string;
  error?: string;
}

export interface AIGeneralAnalysisResponse {
  success: boolean;
  macro_sentiment: string;
  options_regime: string;
  active_walls: string;
  magnetic_target: string;
  flow_pressure: string;
  z_score: string;
  projection_scenario_a: string;
  projection_scenario_b: string;
  setup_direction: 'COMPRAR' | 'VENDER' | 'AGUARDAR' | string;
  setup_strategy: string;
  setup_trigger: string;
  setup_target_1: string;
  setup_target_2: string;
  setup_stop: string;
  alerts: string;
  error?: string;
}

export const DEFAULT_GENERAL_PROMPT_TEMPLATE = `# GRIXCORE OMNI-ENGINE v3.0 (Triangulação Institucional)

Você é o Motor de Análise Institucional definitivo, especializado na leitura de opções (GrixCore), fluxo de ordens (Tape Reading) e sentimento macro/micro. Seu objetivo é identificar setups de altíssima probabilidade através da triangulação de 3 pilares:

1. ESTRUTURA GAMMA (GrixCore)
- Analise os níveis Gamma Wall, Put Support 0DTE, Call Resistance 0DTE e HVL.
- Identifique se o preço está em zonas de compressão (GEX positivo travando preço) ou zonas de vácuo/aceleração (Void Gamma).
- Determine a direção do viés gamma (Comprador vs Vendedor) e a força dessa convicção.

2. FLUXO E MOMENTUM (Tape Reading)
- Avalie o Delta Acumulado e a inclinação do Delta Ratio.
- Monitore a atividade de Large/Block Trades (identificando absorção ou agressão institucional).
- Analise a Força Momentum agregada (Nasdaq, S&P 500, DXY, VIX) para ver alinhamento de fluxo.

3. MACRO E SENTIMENTO (Z-Score, ATR & Correlação Inversa de VIX/DXY)
- Use o Z-Score para avaliar se o preço está em extremos estatísticos (Excesso de desvio padrão > 2.0 ou < -2.0 indica exaustão).
- Avalie o ATR Ratio para medir volatilidade atual (ATR baixo = compressão/acumulação; ATR alto = expansão/tendência).
- Monitore os Velocímetros de Sentimento: Sentimento Macro e Sentimento Micro.
- REGRA DE CORRELAÇÃO INVERSA (CRÍTICO PARA NASDAQ/S&P 500):
  * VIX e USDINDEX (DXY) são INVERSAMENTE PROPORCIONAIS ao Nasdaq e S&P 500.
  * Força COMPRADORA no VIX/USDINDEX (alta/medo/dólar forte) = PRESSÃO VENDEDORA (BAIXISTA) para o Nasdaq.
  * Força VENDEDORA no VIX/USDINDEX (queda/alívio/dólar fraco) = FLUXO COMPRADOR (ALTISTA) para o Nasdaq.
  * S&P 500 e ações M7 (NVDA, AAPL, MSFT...) são DIRETAMENTE PROPORCIONAIS ao Nasdaq.

4. ANÁLISE VISUAL DO GRÁFICO (Screenshot)
- Analise detidamente a imagem do gráfico (screenshot base64) para verificar a tendência atual, velas de força e o comportamento do preço próximo dos níveis Gamma.
- CRÍTICO: Identifique se o movimento previsto já aconteceu ou se o preço já andou demais. Se o preço já esticou e atingiu os alvos previstos, evite entradas atrasadas (chasing/late entry). Nesses casos, defina setup_direction como "AGUARDAR" e alerte sobre o movimento já realizado.

Você deve responder estritamente no formato JSON abaixo, sem texto adicional antes ou depois:

{
  "macro_sentiment": "Ex: Forte Vendedor. NVDA, AAPL com >75% venda.",
  "options_regime": "Ex: Compressão (GEX Positivo no micro), mas com Void Gamma Abaixo",
  "active_walls": "Ex: Gamma Wall em 30.600. Put Support 0DTE em 30.500",
  "magnetic_target": "Ex: HVL (30.090) e Min 1D (30.069)",
  "flow_pressure": "Ex: Vendedora Controlada. Delta negativo e Large Trades vendendo.",
  "z_score": "Ex: -0.39 (Neutro)",
  "projection_scenario_a": "Ex: 75% Prob: Venda rompendo HVL (30.090) até Min 1D (30.069)",
  "projection_scenario_b": "Ex: 25% Prob: Short squeeze buscando a Put Support 0DTE (30.500)",
  "setup_direction": "Ex: VENDER | COMPRAR | AGUARDAR",
  "setup_strategy": "Ex: Trend Until Void",
  "setup_trigger": "Ex: Rompimento do HVL (30.090) com delta_pct < 45%",
  "setup_target_1": "Ex: 30.069 (Min 1D)",
  "setup_target_2": "Ex: 30.000 (Nível GEX)",
  "setup_stop": "Ex: 30.150",
  "alerts": "Ex: Tech vendendo. Cuidado com Buy the dip."
}`;

export function unwrapTextIfJson(rawText: string): string {
  if (!rawText || typeof rawText !== 'string') return '';
  let trimmed = rawText.trim();

  // 1. Tentar remover cercas de código Markdown (```json ... ```)
  const mdMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (mdMatch && mdMatch[1]) {
    trimmed = mdMatch[1].trim();
  }

  // 2. Se for um objeto JSON válido contendo campo de resposta textual
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null) {
        const inner = parsed.resposta || parsed.response || parsed.text || parsed.content || parsed.message || parsed.resumo || parsed.analysis;
        if (inner && typeof inner === 'string') {
          return inner.trim();
        }
      }
    } catch {}
  }

  return rawText;
}

export function stripThinkingTags(rawText: string): string {
  if (!rawText || typeof rawText !== 'string') return '';
  
  // 1. Tentar remover blocos completos <think>...</think>
  let text = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '');

  // 2. Se sobrou texto fora de <think>, remover tags soltas e cabeçalhos
  if (text.trim().length > 0) {
    text = text.replace(/<think>[\s\S]*$/gi, '');
    text = text.replace(/<\/?think>/gi, '');
    text = text.replace(/^(?:Here(?:'s| is) a thinking process:?|Thinking Process:?|Thought Process:?|Let me think through this:?)[\s\S]*?(?=\n\n|\n[A-Z0-9{"'])/i, '');
    return unwrapTextIfJson(text.trim());
  }

  // 3. Se todo o texto estava DENTRO de <think>, extrair o texto de dentro sem as tags
  let fallback = rawText.replace(/<\/?think>/gi, '');
  fallback = fallback.replace(/^(?:Here(?:'s| is) a thinking process:?|Thinking Process:?|Thought Process:?|Let me think through this:?)\s*/i, '');
  return unwrapTextIfJson(fallback.trim());
}

export function cleanAndParseJson(responseText: string): any {
  if (!responseText || typeof responseText !== 'string') {
    throw new Error('A resposta da IA veio vazia.');
  }

  // 1. Tentar parse direto no texto original
  try {
    return JSON.parse(responseText.trim());
  } catch {}

  // 2. Tentar remover cercas de código Markdown (```json ... ```)
  const markdownJsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (markdownJsonMatch && markdownJsonMatch[1]) {
    try {
      return JSON.parse(markdownJsonMatch[1].trim());
    } catch {}
  }

  // 3. Tentar extração de primeiro '{' até o último '}' no texto completo
  const firstBrace = responseText.indexOf('{');
  const lastBrace = responseText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = responseText.substring(firstBrace, lastBrace + 1).trim();
    try {
      return JSON.parse(candidate);
    } catch {
      // Tentativa de saneamento com remoção de vírgulas trailing
      const sanitized = candidate
        .replace(/,\s*([\}\]])/g, '$1')
        .replace(/[\u201C\u201D]/g, '"');
      try {
        return JSON.parse(sanitized);
      } catch {}
    }
  }

  // 4. Se não achou no original, tentar no texto limpo de thinking tags
  const text = stripThinkingTags(responseText);
  const tbFirst = text.indexOf('{');
  const tbLast = text.lastIndexOf('}');
  if (tbFirst !== -1 && tbLast > tbFirst) {
    const candidate = text.substring(tbFirst, tbLast + 1).trim();
    try {
      return JSON.parse(candidate);
    } catch {
      const sanitized = candidate
        .replace(/,\s*([\}\]])/g, '$1')
        .replace(/[\u201C\u201D]/g, '"');
      try {
        return JSON.parse(sanitized);
      } catch {}
    }
  }

  throw new Error('A resposta da IA não contém um bloco JSON válido.');
}

export async function runMarketAnalysis(data: AIRequestData): Promise<AIResponse> {
  const {
    provider,
    apiKey,
    model,
    symbol,
    price,
    zScore,
    atrRatio,
    sentiment,
    delta,
    deltaRatio,
    prints,
    forces,
    blockTrades,
    news,
    levels,
    screenshotBase64,
    promptTemplate,
    gammaBias
  } = data;

  if (!apiKey) {
    return {
      success: false,
      sinal: 'AGUARDANDO',
      confianca: '--',
      alvo: '--',
      stop: '--',
      resumo: 'API Key não configurada.',
      error: 'API Key ausente'
    };
  }

  // Montar JSON enriquecido contendo os dados 360 do mercado
  const marketContext = {
    symbol,
    price,
    indicators: {
      zScore,
      atrRatio,
      macroSentiment: data.macroSentiment !== undefined ? data.macroSentiment : sentiment,
      microSentiment: data.microSentiment !== undefined ? data.microSentiment : sentiment,
      sentimentValue: sentiment,
      delta,
      deltaRatio,
      printsPerSecond: prints
    },
    macro_indexes: data.macroIndexes || {
      sp500: 'S&P 500 (ES)',
      usdIndex: 'USD Index (DXY)',
      vix: 'VIX Fear Index',
      nasdaq: 'Nasdaq (NQ)'
    },
    magnificent_7_stocks: data.stocksM7 || {},
    forces_aggregated: forces.map(f => `${f.symbol}: Compra ${f.buy}%, Venda ${f.sell}%`).join(' | '),
    volume_profile_and_liquidity: data.volumeProfile ? {
      vpoc: data.volumeProfile.vpoc || '--',
      vah_70: data.volumeProfile.vah || '--',
      val_70: data.volumeProfile.val || '--',
      naked_pocs: data.volumeProfile.nakedPocs || [],
      hvn_absorption_blocks: (data.volumeProfile.hvnBlocks || []).map(b => ({
        rank: b.rank,
        price_center: b.priceCenter,
        range: [b.priceBottom, b.priceTop]
      }))
    } : undefined,
    position_sizing_and_risk: data.sizingManagement || {
      mode: 'lote',
      fixedContracts: 1
    },
    current_open_position: data.currentPosition || null,
    price_action_and_candles: data.priceActionCandles || null,
    active_chart_indicators_readings: data.activeChartIndicators || null,
    active_widgets_readings: (data.activeWidgetsData && data.activeWidgetsData.length > 0) ? data.activeWidgetsData : null,
    last_closed_trade_review: data.lastClosedTrade || null,
    user_dialogue_question: data.userMessage || null,
    block_trades_tape: (blockTrades || []).slice(0, 10), // últimas 10 ordens institucionais
    gamma_levels_and_walls: levels,
    gamma_bias: gammaBias,
    news_countdowns: (news || []).slice(0, 5) // Últimas notícias
  };

  const defaultPrompt = `Você é o Copilot de Trading Quantitativo Institucional de Alta Precisão (Axion TradeStation AI), conversando em tempo real com o Trader e gerenciando operações na conta.

REGRAS MANDATÓRIAS DE ANÁLISE E EXECUÇÃO:

1. GATILHO DE ENTRADA E PRICE ACTION OBRIGATÓRIO:
   - Mesmo que o viés macro/gamma seja vendedor, É PROIBIDO abrir VENDA se a vela atual for de FORÇA COMPRADORA (candle verde fechando na máxima). A venda exige GATILHO TÉCNICO VENDEDOR CONFIRMADO: rejeição de topo com pavio superior longo em nível Gamma/Volume, candle de reversão/exaustão, queda de volume na retração ou candle de ignição vendedor alinhado ao fluxo.
   - Inversamente, É PROIBIDO abrir COMPRA se a vela atual for de FORÇA VENDEDORA. A compra exige rejeição de fundo com pavio inferior ou candle de ignição comprador.
   - Use o bloco "price_action_and_candles" para verificar a vela atual e as 3 velas anteriores.

2. GESTÃO DE POSIÇÃO RECÉM-ABERTA (SEM SAÍDA PREMATURA):
   - Se a operação tiver menos de 3 minutos de duração (current_open_position.durationMinutes < 3): MANTENHA A OPERAÇÃO ("tradeAction": "HOLD"). NÃO sugira encerrar a mercado nem Break-Even prematuro logo após a abertura, permitindo que a operação respire e desenvolva sua tese.
   - Sugira "BREAK_EVEN" ou "TRAIL_STOP" apenas se o preço tiver andado a favor com pelo menos 40% a 50% de evolução em direção ao alvo, ou se houver reversão estrutural consolidada.

3. AVALIAÇÃO CRÍTICA PÓS-STOP (Memória de Trades Anteriores):
   - Se a última operação (last_closed_trade_review) foi um STOP:
     * Avalie por que o Stop ocorreu antes de emitir um novo sinal.
     * Se a tese anterior foi invalidada (ex: rompimento com volume da resistência), NÃO repita a mesma direção de imediato. Aguarde nova confirmação.
     * No campo "copilotThought", mencione a lição do Stop anterior e justifique por que a nova operação é segura ou por que está aguardando.

4. INDICADORES ATIVOS DO GRÁFICO:
   - Integre as leituras dos indicadores ativos do gráfico (active_chart_indicators_readings), como EMAs, VWAP, Supertrend, SMC Order Blocks e Volume Profile.

5. WIDGETS ATIVOS E MAPA TOPOGRÁFICO DE GAMMA (active_widgets_readings):
   - Se houver widgets ativos no gráfico (veja o bloco JSON "active_widgets_readings"), especialmente o "gamma_quant_map", você DEVE incorporar sua leitura topográfica:
     * Verifique o espaço livre até a próxima resistência (clear_air_up_points) e suporte (clear_air_down_points).
     * Se o plano acusar "RESISTÊNCIA IMINENTE" ou "SUPORTE IMINENTE" (entrada desfavorável), NÃO recomende compras ou vendas contra a parede física de opções.
     * Se o plano acusar "AUTOESTRADA LIVRE", aproveite o vácuo de Gamma com o TP/SL sugerido pelo modelo quantitativo.
     * Respeite a separação entre o Trade Tático da Sessão atual e o Setup Estrutural nas Paredes 0DTE.

6. REGRA DE CORRELAÇÃO INVERSA DO MACRO (CRÍTICO PARA NASDAQ / S&P 500 / AÇÕES):
   - VIX e USDINDEX (DXY) são INVERSAMENTE PROPORCIONAIS ao Nasdaq (NQ) e S&P 500 (ES).
   - Se o VIX ou o USDINDEX apresentarem FORÇA COMPRADORA (subindo / verde), interprete como PRESSÃO VENDEDORA (BAIXISTA) para o ativo.
   - Se o VIX ou o USDINDEX apresentarem FORÇA VENDEDORA (caindo / vermelho), interprete como FLUXO COMPRADOR (ALTISTA) para o ativo.
   - S&P 500 e ações M7 (NVDA, AAPL, MSFT, TSLA...) são DIRETAMENTE PROPORCIONAIS.

7. SE NÃO HOUVER POSIÇÃO ABERTA (current_open_position é null):
   - Se houver confluência nítida (Macro + Gamma + Volume + Gatilho de Price Action) e confiança >= 75%: defina "sinal": "COMPRA" | "VENDA", "tradeAction": "OPEN", "confianca": "ex: 85%", com "alvo" e "stop" protegidos.
   - Caso contrário: defina "sinal": "AGUARDANDO", "tradeAction": "HOLD", e explique no "copilotThought" o que falta acontecer para confirmar a entrada.

DADOS DO MERCADO 360°:
${JSON.stringify(marketContext)}

Você deve responder EXCLUSIVAMENTE em formato JSON puro:
{
  "sinal": "COMPRA" | "VENDA" | "SAIR" | "AGUARDANDO",
  "confianca": "percentual de confiança, ex: 85%",
  "alvo": "preço alvo numérico sugerido de acordo com a VPOC / Naked POC / Níveis Gamma ou '--'",
  "stop": "preço de stop loss protegido numérico (ex: 21520.25) atrás do HVN Block / VAL / VAH / Put 0DTE ou '--'",
  "resumo": "Explicação ultra-curta (máx 15 palavras) da confluência.",
  "gatilho": "Gatilho técnico exato de confirmação de entrada e momento de execução (ex: 'Rompimento de 21,550.00 com fluxo' ou 'Pullback no suporte 21,510.00 com rejeição') ou '--'",
  "alerta": "Informação de alerta ou notícia iminente ou '--'",
  "copilotThought": "Mensagem conversacional de piloto para o trader em português explicando o raciocínio, price action e status atual.",
  "tradeAction": "OPEN" | "HOLD" | "TRAIL_STOP" | "BREAK_EVEN" | "CLOSE",
  "suggestedStopUpdate": "preço numérico sugerido para proteção ou '--'"
}`;

  const finalPrompt = promptTemplate 
    ? `${promptTemplate}\n\nCONTEXTO DO MERCADO:\n${JSON.stringify(marketContext, null, 2)}`
    : defaultPrompt;

  try {
    let responseText = '';

    if (provider === 'groq') {
      responseText = await callGroqAPI(apiKey, model, finalPrompt, screenshotBase64);
    } else if (provider === 'openai') {
      responseText = await callOpenAI(apiKey, model, finalPrompt, screenshotBase64);
    } else if (provider === 'gemini') {
      responseText = await callGeminiAPI(apiKey, model, finalPrompt, screenshotBase64, true);
    } else {
      throw new Error(`Provedor de IA desconhecido: ${provider}`);
    }

    let result: any = null;
    try {
      result = cleanAndParseJson(responseText);
    } catch {
      // Fallback resiliente: se a IA retornou texto puro/prosa em vez de JSON
      const cleanText = stripThinkingTags(responseText);
      const isBuy = /\b(COMPRA|BUY|COMPRAR)\b/i.test(cleanText);
      const isSell = /\b(VENDA|SELL|VENDER)\b/i.test(cleanText);
      const signal = isBuy && !isSell ? 'COMPRA' : isSell && !isBuy ? 'VENDA' : 'AGUARDANDO';

      return {
        success: true,
        sinal: signal,
        confianca: '75%',
        alvo: '--',
        stop: '--',
        resumo: cleanText.length > 180 ? cleanText.slice(0, 180) + '...' : cleanText,
        gatilho: '--',
        alerta: '--',
        copilotThought: cleanText,
        tradeAction: signal === 'COMPRA' || signal === 'VENDA' ? 'OPEN' : 'HOLD',
        suggestedStopUpdate: '--'
      };
    }

    return {
      success: true,
      sinal: result.sinal || result.signal || 'AGUARDANDO',
      confianca: result.confianca || result.confidence || '0%',
      alvo: result.alvo || result.targetPrice || result.setup_target_1 || '--',
      stop: result.stop || result.stopPrice || result.setup_stop || '--',
      resumo: stripThinkingTags(result.resumo || result.resposta || 'Análise concluída.'),
      gatilho: result.gatilho || result.setup_trigger || result.trigger || result.entry_trigger || result.gatilho_entrada || '--',
      alerta: result.alerta || result.alerts || '--',
      copilotThought: stripThinkingTags(result.copilotThought || result.resumo || result.resposta || 'Monitorando o fluxo institucional e confluências do mercado.'),
      tradeAction: result.tradeAction || result.action || (result.sinal === 'COMPRA' || result.sinal === 'VENDA' ? 'OPEN' : 'HOLD'),
      suggestedStopUpdate: result.suggestedStopUpdate || '--'
    };

  } catch (error: any) {
    console.error('[AI SERVICE] Erro de análise:', error);
    return {
      success: false,
      sinal: 'AGUARDANDO',
      confianca: '--',
      alvo: '--',
      stop: '--',
      resumo: `Erro na execução da IA: ${error.message || error}`,
      error: error.message
    };
  }
}

export async function askCopilotChat(
  data: AIRequestData,
  userQuestion: string,
  isCopilotAutoOn: boolean,
  chatHistory?: Array<{ sender: 'user' | 'copilot' | 'system'; text: string; timestamp?: string }>
): Promise<{
  success: boolean;
  text: string;
  spokenText?: string;
  confidence?: string;
  signal?: 'COMPRA' | 'VENDA' | 'SAIR' | 'AGUARDANDO';
  targetPrice?: string;
  stopPrice?: string;
  action?: 'OPEN' | 'HOLD' | 'TRAIL_STOP' | 'BREAK_EVEN' | 'CLOSE';
}> {
  const {
    provider,
    apiKey,
    model,
    blockTrades,
    levels,
    screenshotBase64
  } = data;

  if (!apiKey || apiKey.trim() === '') {
    return {
      success: false,
      text: 'Por favor, configure sua Chave de API (Groq, Gemini ou OpenAI) no menu Configurações (⚙️) para conversar com o Copilot.'
    };
  }

  const indicatorsText = (data.activeChartIndicators && data.activeChartIndicators.length > 0)
    ? data.activeChartIndicators.map(ind => `- 📊 ${ind.name} (${ind.type}):\n  * Níveis/Valores: ${ind.valueSummary}${ind.interpretation ? `\n  * Leitura Técnica: ${ind.interpretation}` : ''}`).join('\n')
    : 'Nenhum indicador customizado ativo no gráfico. Apenas preço de mercado e candles.';

  const widgetsText = (data.activeWidgetsData && data.activeWidgetsData.length > 0)
    ? data.activeWidgetsData.map(w => `- 🧩 Widget [${w.title} (${w.type})]: ${w.summary}`).join('\n')
    : 'Nenhum widget flutuante ativo no gráfico.';

  let activeCardsText = 'Nenhum card de opções institucional ativo no painel.';
  if (data.activeCardsData && data.activeCardsData.activeCardNames && data.activeCardsData.activeCardNames.length > 0) {
    const parts: string[] = [];
    parts.push(`Cards Ativos no Painel do Trader: ${data.activeCardsData.activeCardNames.join(', ')}`);

    if (data.activeCardsData.coreAnalytics) {
      const ca = data.activeCardsData.coreAnalytics;
      parts.push(`- 📊 CORE ANALYTICS: Analytics QQQ = ${ca.analyticsQqqPct.toFixed(1)}% | Estrutura QQQ = ${ca.marketStructureQqqPct.toFixed(1)}% | Estrutura SPY = ${ca.marketStructureSpyPct.toFixed(1)}% (Status IA: ${ca.aiStatus || 'ACTIVE'})`);
    }

    if (data.activeCardsData.anchors) {
      const an = data.activeCardsData.anchors;
      parts.push(`- ⚓ ANCHORS: SPY = ${an.spyPct.toFixed(1)}% (${an.spySignal}) | QQQ = ${an.qqqPct.toFixed(1)}% (${an.qqqSignal})`);
    }

    if (data.activeCardsData.flowAndExposure) {
      const fe = data.activeCardsData.flowAndExposure;
      parts.push(`- 🌊 FLOW & EXPOSURE: Rho Index = ${fe.rhoIndexPct.toFixed(1)}% | Tail Risk = ${fe.tailRiskPct.toFixed(1)}% | Vol Smile QQQ = ${fe.volatilitySmileQqqPct.toFixed(1)}% | Vol Smile SPY = ${fe.volatilitySmileSpyPct.toFixed(1)}% | Net Gamma = ${fe.netGammaPct.toFixed(1)}%`);
    }

    if (data.activeCardsData.stockReplacement) {
      const sr = data.activeCardsData.stockReplacement;
      parts.push(`- 🔄 STOCK REPLACEMENT (${sr.symbol}): CALL = ${sr.callPct.toFixed(1)}% (${sr.callSignal}) | PUT = ${sr.putPct.toFixed(1)}% (${sr.putSignal})`);
    }

    activeCardsText = parts.join('\n');
  }

  const isPanel1 = Boolean(data.isPanel1);
  const panelModeGuidelines = isPanel1
    ? `🟢 MODO PAINEL 1 (VISÃO MACRO 360 COM CARDS & INDICADORES DO GRÁFICO):
- Integre os Cards Institucionais Ativos (Core Analytics, Anchors, Flow & Exposure, Stock Replacement) com os Indicadores Técnicos do Gráfico para confluência global.`
    : `🔵 MODO PAINEL 2 (ESTRATÉGIA FOCADA NO GRÁFICO, INDICADORES & WIDGETS):
- REGRA MANDATÓRIA: A sua análise e tomada de decisão DEVE ser baseada EXCLUSIVAMENTE nas informações visíveis e ativas no gráfico deste painel (${data.symbol}): "Indicadores no Gráfico" e "Widgets Flutuantes Ativos no Gráfico".
- NÃO assuma cards ou métricas externas que não estejam ativas neste gráfico.
- Quando o Trader perguntar sobre valores e leituras presentes nos indicadores ou widgets do gráfico (como Preço de Ajuste / Fechamento Anterior, HVL, GWall, VWAP, Sentimento, Delta, Z-Score, ATR, Máxima/Mínima, Níveis Gamma, Bandas, Médias Móveis, Order Blocks SMC), responda com PRECISÃO e EXATIDÃO utilizando os dados reais listados acima.`;

  // Compactar dados de mercado para formato conciso e de baixo consumo de tokens (economia de ~70% de tokens)
  const levelsCompact = levels
    ? Object.entries(levels)
        .filter(([_, v]) => v && v !== '--')
        .map(([k, v]) => `${k}: ${v}`)
        .join(' | ')
    : 'Nenhum nível';

  const m7Compact = data.stocksM7
    ? Object.entries(data.stocksM7)
        .map(([k, v]: any) => `${k}: C${v.buy}%/V${v.sell}%`)
        .join(' | ')
    : '--';

  const forcesCompact = (data.forces || [])
    .map(f => `${f.symbol}: C${f.buy}%/V${f.sell}%`)
    .join(' | ');

  const macroCompact = data.macroIndexes
    ? Object.entries(data.macroIndexes)
        .map(([k, v]: any) => `${k}: C${v.buy}%/V${v.sell}%`)
        .join(' | ')
    : '--';

  const tapeCompact = (blockTrades || []).slice(0, 5).join(' | ');

  const systemInstructions = `Você é o Axion, parceiro quantitativo e copilot de trading do Trader na mesa de operações (VortexWeb).

TOM E ESTILO DE COMUNICAÇÃO:
- Responda em Português do Brasil (pt-BR) como um trader profissional experiente ao lado dele na mesa: INFORMAL, DIRETO, CONCISO E OBJETIVO.
- NUNCA use introduções formais ou robóticas (ex: "Olá Trader, aqui é o Axion...", "Como assistente de IA..."). Comece DIRETO na resposta.
- MARKDOWN LIMPO: Use negrito para preços e conceitos-chave. NÃO use excesso de emojis decorativos.

ESCOPO DE ANÁLISE DO PAINEL ATUAL:
${panelModeGuidelines}

SÍNTESE DE VOZ E RESUMO EXECUTIVO PARA ÁUDIO:
- O texto exibido no chat pode conter cálculos, detalhes técnicos, níveis e análise completa para leitura visual.
- Quando a sua resposta contiver cálculos por etapas (máxima, mínima, range, etc.) ou uma lista extensa de dados de mercado (preço, gamma bias, walls de opções, volume institucional, heatmap, etc.), inclua SEMPRE no final da resposta a tag <speech>...</speech> contendo EXCLUSIVAMENTE o resumo falado direto, enxuto e prático:
  * Se a pergunta for sobre cálculo/nível: fale DIRETO apenas o resultado final (ex: <speech>Nível de retração 61,8% projetado em 29.674,60.</speech>).
  * Se a pergunta for sobre análise/cenário: fale DIRETO apenas a probabilidade e a recomendação prática (ex: <speech>Alta chance de recuperação de 29.528 até a parede de 29.600 com possível retorno. Recomendação: Compra em 29.530 com Stop Loss em 29.480 e Take Profit em 29.600.</speech>).

STATUS OPERACIONAL E AUTONOMIA:
${isCopilotAutoOn ? '🟢 PILOTO AUTOMÁTICO LIGADO: Ordens monitoradas e executadas na boleta.' : '⚪ PILOTO AUTOMÁTICO DESLIGADO (MODO COPILOT/ASSISTENTE COM EXECUÇÃO SOB DEMANDA).'}

INTEGRAÇÃO COM A TRADESTATION:
- Você POSSUI integração total com a Boleta e envio de ordens na plataforma VortexWeb.
- É PROIBIDO dizer que "não tem conexão com corretora" ou "opere manualmente".
- Quando o Trader autorizar uma operação ("Pode executar?", "Executar", "Abra a compra/venda", "Confirmo a entrada"), responda confirmando a execução da ordem na boleta com entrada, Stop Loss e Take Profit.

DADOS DE MERCADO DO ATIVO ${data.symbol} [${data.panelModeLabel || (isPanel1 ? 'Painel 1 (Cards & Indicadores)' : 'Painel 2 (Indicadores & Widgets)')}] (PREÇO ATUAL: ${data.price}):
- Indicadores no Gráfico:
${indicatorsText}
- Widgets Flutuantes Ativos no Gráfico:
${widgetsText}
${isPanel1 ? `- Cards do Dashboard:\n${activeCardsText}` : ''}
- Níveis Gamma / Pregão: ${levelsCompact}
- Posição Aberta: ${data.currentPosition ? `${data.currentPosition.side} (${data.currentPosition.contracts} cts) em ${data.currentPosition.entryPrice} | Stop: ${data.currentPosition.stopLoss || '--'} | Alvo: ${data.currentPosition.takeProfit || '--'}` : 'Nenhuma posição aberta.'}
- Tape Recente: ${tapeCompact || 'Sem ordens registradas'}
- Sentimento: Macro = ${data.macroSentiment !== undefined ? data.macroSentiment : data.sentiment}% | Micro = ${data.microSentiment !== undefined ? data.microSentiment : data.sentiment}%
- Acelerômetro / Estado: ${data.estado || 'NORMAL'} (Z-Score: ${data.zScore}, ATR Ratio: ${data.atrRatio})
- Mag 7 Stocks: ${m7Compact}
- Forças Cesta: ${forcesCompact}
- Macro / Correlações: ${macroCompact}

DIRETRIZES MANDATÓRIAS:
1. Responda EXATAMENTE o que foi perguntado de forma rápida e prática para o pregão.
2. Utilize exclusivamente as informações e confluências ativas neste painel (${data.panelModeLabel || (isPanel1 ? 'Painel 1' : 'Painel 2')}) na sua leitura.
3. FORMATO OBRIGATÓRIO: Texto Markdown direto. NUNCA use formato JSON (não use {}, não use {"resposta": "..."}).`;

  const messages: any[] = [];
  messages.push({ role: 'system', content: systemInstructions });

  // Adicionar histórico recente da conversa podando mensagens anteriores longas para poupar tokens
  if (chatHistory && chatHistory.length > 0) {
    chatHistory.slice(-4).forEach(m => {
      if (m.sender === 'user') {
        messages.push({ role: 'user', content: m.text });
      } else if (m.sender === 'copilot') {
        const trimmed = (m.text || '').length > 250 ? m.text.slice(0, 250) + '...' : m.text;
        messages.push({ role: 'assistant', content: trimmed });
      }
    });
  }

  // Adicionar pergunta atual do usuário (somente inclui imagem de gráfico se fornecida explicitamente)
  if (screenshotBase64 && isModelSupportingVision(provider, model)) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: userQuestion },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshotBase64}` } }
      ]
    });
  } else {
    messages.push({ role: 'user', content: userQuestion });
  }

  try {
    let responseText = '';

    if (provider === 'groq') {
      const url = 'https://api.groq.com/openai/v1/chat/completions';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.2,
          max_tokens: 2048
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Groq API Error (${res.status}): ${errText}`);
      }

      const resJson = await res.json();
      responseText = resJson.choices[0]?.message?.content || '';
    } else if (provider === 'openai') {
      const url = 'https://api.openai.com/v1/chat/completions';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.2,
          max_tokens: 2048
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenAI API Error (${res.status}): ${errText}`);
      }

      const resJson = await res.json();
      responseText = resJson.choices[0]?.message?.content || '';
    } else if (provider === 'gemini') {
      responseText = await callGeminiAPI(apiKey, model, `${systemInstructions}\n\nTrader: "${userQuestion}"`, screenshotBase64, false);
    }

    const cleanRaw = stripThinkingTags(responseText);

    // Extrair tag de voz se presente
    let spokenSummary = '';
    const speechMatch = cleanRaw.match(/<(?:speech|audio)>([\s\S]*?)<\/(?:speech|audio)>/i);
    if (speechMatch && speechMatch[1]) {
      spokenSummary = speechMatch[1].trim();
    }

    // Limpar tag do texto visual de exibição do chat
    const displayMarkdown = cleanRaw
      .replace(/<(?:speech|audio)>[\s\S]*?<\/(?:speech|audio)>/gi, '')
      .replace(/<\/?(?:speech|audio)>/gi, '')
      .trim();

    // Se a IA não forneceu tag explícita, extrair heuristicamente
    const finalSpokenText = spokenSummary || extractSpokenSummary(cleanRaw);

    // Identificar se a resposta contém sinal ou ação clara
    const isBuy = /\b(COMPRA|COMPRAR|BUY)\b/i.test(displayMarkdown);
    const isSell = /\b(VENDA|VENDER|SELL)\b/i.test(displayMarkdown);
    const isExit = /\b(SAIR|ZERAR|ENCERRAR)\b/i.test(displayMarkdown);

    let signal: 'COMPRA' | 'VENDA' | 'SAIR' | 'AGUARDANDO' | undefined = undefined;
    if (isBuy && !isSell) signal = 'COMPRA';
    else if (isSell && !isBuy) signal = 'VENDA';
    else if (isExit) signal = 'SAIR';

    return {
      success: true,
      text: displayMarkdown || 'Não recebi uma resposta válida do modelo. Tente reformular a pergunta.',
      spokenText: finalSpokenText,
      signal: signal,
      action: signal === 'COMPRA' || signal === 'VENDA' ? 'OPEN' : signal === 'SAIR' ? 'CLOSE' : 'HOLD'
    };
  } catch (err: any) {
    return {
      success: false,
      text: `Erro ao consultar o Axion: ${err.message || err}`
    };
  }
}

export async function runGeneralAnalysis(data: AIRequestData): Promise<AIGeneralAnalysisResponse> {
  const {
    provider,
    apiKey,
    model,
    symbol,
    price,
    zScore,
    atrRatio,
    sentiment,
    delta,
    deltaRatio,
    prints,
    forces,
    blockTrades,
    news,
    levels,
    screenshotBase64,
    promptTemplate,
    gammaBias
  } = data;

  if (!apiKey) {
    return {
      success: false,
      macro_sentiment: 'API Key não configurada.',
      options_regime: '--',
      active_walls: '--',
      magnetic_target: '--',
      flow_pressure: '--',
      z_score: '--',
      projection_scenario_a: '--',
      projection_scenario_b: '--',
      setup_direction: 'AGUARDAR',
      setup_strategy: '--',
      setup_trigger: '--',
      setup_target_1: '--',
      setup_target_2: '--',
      setup_stop: '--',
      alerts: '--',
      error: 'API Key ausente'
    };
  }

  const marketContext = {
    symbol,
    price,
    indicators: {
      zScore,
      atrRatio,
      estado: data.estado || 'NORMAL',
      macroSentiment: data.macroSentiment !== undefined ? data.macroSentiment : sentiment,
      microSentiment: data.microSentiment !== undefined ? data.microSentiment : sentiment,
      sentimentValue: sentiment,
      delta,
      deltaRatio,
      printsPerSecond: prints
    },
    forces: forces.map(f => `${f.symbol}: Compra ${f.buy}%, Venda ${f.sell}%`).join(' | '),
    blockTrades: blockTrades.slice(0, 10),
    relevantLevels: levels,
    gammaBias,
    newsCountdowns: news.slice(0, 5)
  };

  const finalPrompt = promptTemplate 
    ? `${promptTemplate}\n\nCONTEXTO DO MERCADO:\n${JSON.stringify(marketContext, null, 2)}`
    : `${DEFAULT_GENERAL_PROMPT_TEMPLATE}\n\nCONTEXTO DO MERCADO:\n${JSON.stringify(marketContext, null, 2)}`;

  try {
    let responseText = '';

    if (provider === 'groq') {
      responseText = await callGroqAPI(apiKey, model, finalPrompt, screenshotBase64);
    } else if (provider === 'openai') {
      responseText = await callOpenAI(apiKey, model, finalPrompt, screenshotBase64);
    } else if (provider === 'gemini') {
      responseText = await callGeminiAPI(apiKey, model, finalPrompt, screenshotBase64, true);
    } else {
      throw new Error(`Provedor de IA desconhecido: ${provider}`);
    }

    const result = cleanAndParseJson(responseText);

    return {
      success: true,
      macro_sentiment: result.macro_sentiment || '--',
      options_regime: result.options_regime || '--',
      active_walls: result.active_walls || '--',
      magnetic_target: result.magnetic_target || '--',
      flow_pressure: result.flow_pressure || '--',
      z_score: result.z_score || '--',
      projection_scenario_a: result.projection_scenario_a || '--',
      projection_scenario_b: result.projection_scenario_b || '--',
      setup_direction: result.setup_direction || 'AGUARDAR',
      setup_strategy: result.setup_strategy || '--',
      setup_trigger: result.setup_trigger || '--',
      setup_target_1: result.setup_target_1 || '--',
      setup_target_2: result.setup_target_2 || '--',
      setup_stop: result.setup_stop || '--',
      alerts: result.alerts || '--'
    };

  } catch (error: any) {
    console.error('[AI SERVICE] Erro na Análise Geral:', error);
    return {
      success: false,
      macro_sentiment: `Erro na execução da IA: ${error.message || error}`,
      options_regime: '--',
      active_walls: '--',
      magnetic_target: '--',
      flow_pressure: '--',
      z_score: '--',
      projection_scenario_a: '--',
      projection_scenario_b: '--',
      setup_direction: 'AGUARDAR',
      setup_strategy: '--',
      setup_trigger: '--',
      setup_target_1: '--',
      setup_target_2: '--',
      setup_stop: '--',
      alerts: '--',
      error: error.message
    };
  }
}


export function isModelSupportingVision(provider: 'groq' | 'gemini' | 'openai', model: string): boolean {
  const m = model.toLowerCase();
  if (provider === 'gemini') {
    return true;
  }
  if (provider === 'openai') {
    return m.includes('gpt-4o') || m.includes('gpt-4-turbo') || m.startsWith('o1') || m.startsWith('o3') || m.includes('gpt-5') || m.includes('gpt-6');
  }
  if (provider === 'groq') {
    return m.includes('qwen') || m.includes('vision') || m.includes('scout') || m.includes('maverick');
  }
  return false;
}

// 1. Chamada Groq API
async function callGroqAPI(apiKey: string, model: string, prompt: string, base64Image?: string): Promise<string> {
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  
  const messages: any[] = [];
  
  // Groq exige que a palavra 'json' apareça nas instruções para ativar json_object
  messages.push({
    role: 'system',
    content: 'Você é o Copilot Axion IA de Trading Quantitativo. Responda SEMPRE e EXCLUSIVAMENTE em Português do Brasil (pt-BR). É expressamente PROIBIDO gerar tags <think>, raciocínios em inglês ou pensamentos preliminares. Responda estritamente no formato JSON em português.'
  });

  if (base64Image && isModelSupportingVision('groq', model)) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        {
          type: 'image_url',
          image_url: {
            url: `data:image/png;base64,${base64Image}`
          }
        }
      ]
    });
  } else {
    messages.push({
      role: 'user',
      content: prompt
    });
  }

  const isReasoning = model.toLowerCase().includes('qwen') || 
                      model.toLowerCase().includes('deepseek') || 
                      model.toLowerCase().includes('r1') || 
                      model.toLowerCase().includes('scout') || 
                      model.toLowerCase().includes('thinking') ||
                      model.toLowerCase().includes('gpt-oss') ||
                      model.toLowerCase().includes('opt');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1,
      max_tokens: 2048,
      ...(!isReasoning ? { response_format: { type: 'json_object' } } : {})
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API Error (${response.status}): ${errText}`);
  }

  const resJson = await response.json();
  const rawContent = resJson.choices[0]?.message?.content || '';
  return rawContent;
}

// 2. Chamada OpenAI API (GPT)
async function callOpenAI(apiKey: string, model: string, prompt: string, base64Image?: string): Promise<string> {
  const url = 'https://api.openai.com/v1/chat/completions';
  
  const messages: any[] = [];

  messages.push({
    role: 'system',
    content: 'Você é o Copilot Axion IA de Trading Quantitativo. Responda SEMPRE e EXCLUSIVAMENTE em Português do Brasil (pt-BR). Responda estritamente no formato JSON em português.'
  });
  
  if (base64Image && isModelSupportingVision('openai', model)) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        {
          type: 'image_url',
          image_url: {
            url: `data:image/png;base64,${base64Image}`
          }
        }
      ]
    });
  } else {
    messages.push({
      role: 'user',
      content: prompt
    });
  }

  const isReasoning = model.toLowerCase().startsWith('o1') || 
                      model.toLowerCase().startsWith('o3') || 
                      model.toLowerCase().includes('reasoning');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: isReasoning ? undefined : 0.1,
      ...(!isReasoning ? { response_format: { type: 'json_object' } } : {})
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API Error (${response.status}): ${errText}`);
  }

  const resJson = await response.json();
  const rawContent = resJson.choices[0]?.message?.content || '';
  return stripThinkingTags(rawContent);
}

// 3. Chamada Gemini API (Nativa Google v1beta com Fallback Automático anti-404)
async function callGeminiAPI(apiKey: string, model: string, prompt: string, base64Image?: string, isJsonMode: boolean = false): Promise<string> {
  const resolveModelName = (targetModel: string): string => {
    const m = (targetModel || '').toLowerCase().trim();
    if (m === 'gemini-3.8-flash' || m.includes('3.8')) return 'gemini-3.8-flash';
    if (m === 'gemini-3.6-flash') return 'gemini-3.6-flash';
    if (m === 'gemini-3.5-flash-lite') return 'gemini-3.5-flash-lite';
    if (m === 'gemini-3.1-flash-lite') return 'gemini-3.1-flash-lite';
    if (m.startsWith('gemini-3.') || m.startsWith('gemini-2.5')) return m;
    if (m.includes('lite')) return 'gemini-3.5-flash-lite';
    return 'gemini-3.8-flash';
  };

  const primaryModel = resolveModelName(model);
  const fallbackList = [primaryModel, 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'].filter(
    (val, idx, arr) => arr.indexOf(val) === idx
  );

  let lastError: any = null;

  for (const currentModel of fallbackList) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`;

      const contents: any = {
        parts: [{ text: prompt }]
      };

      if (base64Image && isModelSupportingVision('gemini', currentModel)) {
        contents.parts.push({
          inlineData: {
            mimeType: 'image/png',
            data: base64Image
          }
        });
      }

      const genConfig: any = {
        temperature: 0.1
      };
      if (isJsonMode) {
        genConfig.responseMimeType = 'application/json';
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: contents.parts }],
          generationConfig: genConfig
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        if (response.status === 404 && fallbackList.indexOf(currentModel) < fallbackList.length - 1) {
          console.warn(`[GEMINI API] Modelo '${currentModel}' retornou 404 (Não Encontrado). Tentando fallback automático para '${fallbackList[fallbackList.indexOf(currentModel) + 1]}'...`);
          lastError = new Error(`Gemini API Error (${response.status}): ${errText}`);
          continue;
        }
        throw new Error(`Gemini API Error (${response.status}): ${errText}`);
      }

      const resJson = await response.json();
      const rawText = resJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return stripThinkingTags(rawText);
    } catch (err: any) {
      lastError = err;
      if (err.message?.includes('404') && fallbackList.indexOf(currentModel) < fallbackList.length - 1) {
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('Falha ao comunicar com a API do Gemini.');
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export async function callGeneralChatAPI(
  provider: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[]
): Promise<string> {
  if (provider === 'groq') {
    const url = 'https://api.groq.com/openai/v1/chat/completions';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq API Error (${response.status}): ${errText}`);
    }
    const resJson = await response.json();
    return resJson.choices[0]?.message?.content || '';
  } else if (provider === 'openai') {
    const url = 'https://api.openai.com/v1/chat/completions';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API Error (${response.status}): ${errText}`);
    }
    const resJson = await response.json();
    return resJson.choices[0]?.message?.content || '';
  } else if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const systemMsg = messages.find(m => m.role === 'system');
    const conversation = messages.filter(m => m.role !== 'system');
    
    const contents = conversation.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    }));
    
    const payload: any = { contents };
    if (systemMsg) {
      payload.systemInstruction = {
        parts: [{ text: systemMsg.content }]
      };
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API Error (${response.status}): ${errText}`);
    }
    const resJson = await response.json();
    return resJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } else {
    throw new Error(`Provedor desconhecido: ${provider}`);
  }
}

