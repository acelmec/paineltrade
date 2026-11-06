// ============================================================================
// Voice Trade Command Parser - Português do Brasil (pt-BR)
// Interpretador determinístico de comandos de trading por voz de ultra-baixa latência
// Suporte a termos técnicos (GWall, Put0dte, GEX, HVL, VAH, VAL, VPOC, NPOC por data)
// Suporte a Break-Even, Ajustes de Stop Loss e Take Profit em qualquer Preço ou Indicador
// Memória de Contexto Recente (últimas mensagens) para composição de ordens
// ============================================================================

export interface VoiceTradeIntent {
  type: 'OPEN_POSITION' | 'MOVE_STOP' | 'BREAK_EVEN' | 'UPDATE_TAKE' | 'CLOSE_POSITION' | 'INCOMPLETE_ORDER' | 'QUERY_INFO';
  side?: 'COMPRA' | 'VENDA';
  contracts?: number;
  riskUsd?: number;
  stopPoints?: number;
  takePoints?: number;
  riskRewardMultiplier?: number;
  stopLevel?: number;
  takeLevel?: number;
  stopCandleReference?: 'current_candle_low' | 'current_candle_high' | 'prior_candle_low' | 'prior_candle_high';
  indicatorStopName?: string;
  indicatorTakeName?: string;
  deltaPoints?: number; // Para mover stop X pontos acima/abaixo
  direction?: 'up' | 'down';
  protectOffsetPoints?: number; // Para proteger a X pontos da entrada
  missingFields?: string[]; // Para INCOMPLETE_ORDER
  promptFeedback?: string; // Pergunta ao trader quando faltar parâmetros
  rawText: string;
  confidenceScore: number;
}

// Sanitizador universal para caracteres especiais Unicode (espaços e hífens não quebráveis)
export function sanitizeMarketText(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
    .replace(/(\d)[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000](\d)/g, '$1$2')
    .replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000]/g, ' ');
}

// Normalizador e Corretor Fonético de Áudio em Português (pt-BR)
export function normalizeVoiceText(raw: string): string {
  if (!raw) return '';
  let text = sanitizeMarketText(raw).toLowerCase().trim();

  // 1. Dicionário de Correção Fonética e Normalização de STT em Português
  const phoneticReplacements: [RegExp, string][] = [
    // Variações com hífens e pontuação
    [/take\s*-\s*profit/gi, 'take'],
    [/stop\s*-\s*loss/gi, 'stop'],
    [/\btake profit\b|\btakeprofit\b|\bteque\b|\btech\b|\bteiki\b|\btake proft\b/gi, 'take'],
    [/\bstop loss\b|\bstoploss\b|\bestoque\b|\bestepe\b|\bestop\b|\bestope\b|\btop loss\b|\btop\b/gi, 'stop'],
    
    // Verbos de Operação
    [/\bcomprar\b|\bcomprou\b|\bcomprado\b|\bcompra\b/gi, 'compre'],
    [/\bvender\b|\bvendeu\b|\bvendido\b|\bvenda\b|\bvende\b/gi, 'venda'],
    [/\bzero a zero\b|\b0 a 0\b|\b0x0\b|\bbreak even\b|\bbreakeven\b/gi, 'break_even'],
    [/\bcancelar\b|\bcancele\b|\bcancela\b|\bencerrar\b|\bencerre\b|\bzerar\b|\bzere\b|\bfechar\b|\bfeche\b|\bsair\b|\bliquidar\b/gi, 'zerar'],
    
    // Indicadores Gamma / GrixCore
    [/\bgwall\b|\bg wall\b|\bg-wall\b|\bji uol\b|\bjiuol\b|\bjiual\b|\bgwaul\b|\bgoul\b/gi, 'gwall'],
    [/\bput0dte\b|\bput 0dte\b|\bput zero dte\b|\bput 0 dte\b|\bput dte\b/gi, 'put0dte'],
    [/\bcall0dte\b|\bcall 0dte\b|\bcall zero dte\b|\bcall 0 dte\b|\bcall dte\b/gi, 'call0dte'],
    [/\bgex\b|\bg ex\b|\bgecs\b|\bgeks\b/gi, 'gex'],
    [/\bhvl0\b|\bhvl zero\b|\bhvl 0\b/gi, 'hvl0'],
    [/\bhvl\b|\bh v l\b/gi, 'hvl'],
    [/\bcall wall\b|\bcallwall\b|\bbarreira de call\b/gi, 'call_wall'],
    [/\bput wall\b|\bputwall\b|\bbarreira de put\b/gi, 'put_wall'],
    
    // Indicadores de Volume Institucional
    [/\bvah\b|\bv a h\b|\bv a aga\b/gi, 'vah'],
    [/\bval\b|\bv a l\b/gi, 'val'],
    [/\bvpoc\b|\bv poc\b|\bv-poc\b|\bpoc\b/gi, 'vpoc'],
    [/\bnpoc\b|\bn poc\b|\bn-poc\b|\bnaked poc\b|\bnakedpoc\b|\bneikid poc\b/gi, 'npoc']
  ];

  for (const [regex, rep] of phoneticReplacements) {
    text = text.replace(regex, rep);
  }

  // 2. Substituições de números por extenso em português
  const numberWords: Record<string, string> = {
    'um': '1', 'uma': '1', 'dois': '2', 'duas': '2', 'três': '3', 'tres': '3',
    'quatro': '4', 'cinco': '5', 'seis': '6', 'meia': '6', 'sete': '7', 'oito': '8',
    'nove': '9', 'dez': '10', 'onze': '11', 'doze': '12', 'quinze': '15',
    'vinte': '20', 'vinte e cinco': '25', 'trinta': '30', 'trinta e cinco': '35',
    'quarenta': '40', 'quarenta e cinco': '45', 'cinquenta': '50', 'sessenta': '60',
    'setenta': '70', 'oitenta': '80', 'noventa': '90', 'cem': '100', 'cento e cinquenta': '150',
    'duzentos': '200', 'quinhentos': '500', 'mil': '1000'
  };

  Object.entries(numberWords).forEach(([word, num]) => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    text = text.replace(regex, num);
  });

  // 3. Variações adicionais de unidades
  text = text
    .replace(/\bdolares\b|\bdólares\b|\bdols\b|\busd\b|\bdoletas\b/g, 'dolares')
    .replace(/\bcontrato\b|\bcontratos\b|\blotes\b|\blote\b|\bcts\b/g, 'contratos')
    .replace(/\bpontos\b|\bponto\b|\bpts\b|\bticks\b/g, 'pontos')
    .replace(/\balvo\b|\bmeta\b/g, 'take');

  return text;
}

// Parser inteligente para diferenciar Nível de Preço de Distância em Pontos (com suporte ao padrão pt-BR)
export function parsePriceOrPoints(
  rawVal: string,
  referencePrice?: number
): { price?: number; points?: number } | null {
  if (!rawVal) return null;
  const cleanStr = rawVal.replace(/[^\d.,-]/g, '');
  if (!cleanStr) return null;

  let num: number | null = null;
  if (cleanStr.includes('.') && cleanStr.includes(',')) {
    if (cleanStr.indexOf('.') < cleanStr.indexOf(',')) {
      num = parseFloat(cleanStr.replace(/\./g, '').replace(/,/g, '.'));
    } else {
      num = parseFloat(cleanStr.replace(/,/g, ''));
    }
  } else if (cleanStr.includes(',')) {
    const parts = cleanStr.split(',');
    if (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3 && referencePrice && referencePrice > 1000) {
      num = parseFloat(parts[0] + parts[1]);
    } else {
      num = parseFloat(cleanStr.replace(/,/g, '.'));
    }
  } else if (cleanStr.includes('.')) {
    const parts = cleanStr.split('.');
    if (parts.length === 2 && parts[1].length === 3) {
      const asFloat = parseFloat(cleanStr);
      const asThousands = parseFloat(parts[0] + parts[1]);
      if (referencePrice && referencePrice > 1000) {
        num = Math.abs(asThousands - referencePrice) < Math.abs(asFloat - referencePrice) ? asThousands : asFloat;
      } else if (asFloat < 100 && asThousands > 1000) {
        num = asThousands;
      } else {
        num = asFloat;
      }
    } else {
      num = parseFloat(cleanStr);
    }
  } else {
    num = parseFloat(cleanStr);
  }

  if (num === null || isNaN(num) || num <= 0) return null;

  // Decisão: é Preço Absoluto ou Distância em Pontos?
  if (referencePrice && referencePrice > 500) {
    if (Math.abs(num - referencePrice) < (referencePrice * 0.45) || num >= 500) {
      return { price: num };
    } else {
      return { points: num };
    }
  }

  if (num >= 500) {
    return { price: num };
  } else {
    return { points: num };
  }
}

// Extrator universal e inteligente de recomendações da conversa
export function extractRecommendationFromText(
  rawText: string,
  referencePrice?: number
): {
  side?: 'COMPRA' | 'VENDA';
  stopLevel?: number;
  takeLevel?: number;
  stopPoints?: number;
  takePoints?: number;
  contracts?: number;
  text?: string;
} | null {
  if (!rawText) return null;
  const text = sanitizeMarketText(rawText);

  // 1. Identificar Lado (Compra / Venda / Long / Short / Call / Put / Bullish / Bearish)
  let side: 'COMPRA' | 'VENDA' | undefined = undefined;
  
  // Priorizar linha de recomendação/setup/posição se existir
  const recLineMatch = text.match(/(?:Recomenda[çc][ãa]o|Setup|Sinal|Ordem|Posi[çc][ãa]o)[\s\S]*?(?:Short|Long|Compra|Venda|Comprar|Vender|Buy|Sell|Call|Put)/i);
  const targetForSide = recLineMatch ? recLineMatch[0] : text;

  const isBuy = /\b(COMPRA|COMPRAR|BUY|LONG|CALL|COMPRADO|BULLISH)\b/i.test(targetForSide);
  const isSell = /\b(VENDA|VENDER|SELL|SHORT|PUT|VENDIDO|BEARISH)\b/i.test(targetForSide);

  if (isBuy && !isSell) side = 'COMPRA';
  else if (isSell && !isBuy) side = 'VENDA';
  else if (isSell && isBuy) {
    if (/Recomenda[çc][ãa]o[\s\S]*?(?:Short|Venda|Vender|Sell|Put)/i.test(text)) side = 'VENDA';
    else if (/Recomenda[çc][ãa]o[\s\S]*?(?:Long|Compra|Comprar|Buy|Call)/i.test(text)) side = 'COMPRA';
    else side = 'VENDA';
  }

  if (!side) return null;

  // 2. Extrair Stop Loss
  let stopLevel: number | undefined = undefined;
  let stopPoints: number | undefined = undefined;
  const stopMatch = text.match(/stop[\s-]*(?:loss)?(?:\s*\(.*?\))?\s*(?:em|de|:)?\s*\**\s*(\d{1,6}(?:[.,]\d+)?)\s*(?:pts|pontos)?\**/i);
  if (stopMatch) {
    const res = parsePriceOrPoints(stopMatch[1], referencePrice);
    if (res?.price) stopLevel = res.price;
    else if (res?.points) stopPoints = res.points;
  }

  // 3. Extrair Take Profit (Alvo)
  let takeLevel: number | undefined = undefined;
  let takePoints: number | undefined = undefined;
  const takeMatch = text.match(/(?:alvo|take|take[\s-]*profit|tp)(?:\s*\(.*?\))?\s*(?:1|2)?\s*(?:em|de|:)?\s*\**\s*(\d{1,6}(?:[.,]\d+)?)\s*(?:pts|pontos)?\**/i);
  if (takeMatch) {
    const res = parsePriceOrPoints(takeMatch[1], referencePrice);
    if (res?.price) takeLevel = res.price;
    else if (res?.points) takePoints = res.points;
  }

  // 4. Extrair Contratos se especificado
  const qtyMatch = text.match(/(?:Quantidade|Contratos?|Lotes?)\s*:\s*\**\s*(\d+)/i);
  const contracts = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

  // Auto-correção Preço vs Pontos
  if (stopPoints && stopPoints >= 500) {
    stopLevel = stopPoints;
    stopPoints = undefined;
  } else if (stopLevel && stopLevel < 500) {
    stopPoints = stopLevel;
    stopLevel = undefined;
  }

  if (takePoints && takePoints >= 500) {
    takeLevel = takePoints;
    takePoints = undefined;
  } else if (takeLevel && takeLevel < 500) {
    takePoints = takeLevel;
    takeLevel = undefined;
  }

  return {
    side,
    stopLevel,
    takeLevel,
    stopPoints,
    takePoints,
    contracts,
    text
  };
}

// Analisador determinístico de intenções de trading
export function parseVoiceTradeCommand(
  rawTranscript: string,
  context?: {
    currentPrice?: number;
    currentPosition?: { side: 'COMPRA' | 'VENDA'; entryPrice: number; stopLoss?: number; takeProfit?: number; contracts?: number } | null;
    currentCandle?: { open: number; high: number; low: number; close: number };
    priorCandle?: { open: number; high: number; low: number; close: number };
    pointValueUsd?: number;
    chatHistory?: Array<{ sender: string; text: string }>;
    levels?: {
      hvl?: number;
      gwall?: number;
      call?: number;
      put?: number;
      call0dte?: number;
      put0dte?: number;
      hvl0?: number;
      gex?: number;
      [key: string]: any;
    };
    volumeProfile?: {
      vpoc?: number | string;
      vah?: number | string;
      val?: number | string;
      nakedPocs?: Array<{ date?: string; price?: number; poc?: number; timestamp?: string }>;
      [key: string]: any;
    };
    lastRecommendation?: {
      side?: 'COMPRA' | 'VENDA';
      stopLevel?: number;
      takeLevel?: number;
      stopPoints?: number;
      takePoints?: number;
      contracts?: number;
      text?: string;
    };
  }
): VoiceTradeIntent {
  const norm = normalizeVoiceText(rawTranscript);

  // ==========================================================================
  // FILTRO 0: CONSULTAS ANALÍTICAS / DISCUSSÃO / CORREÇÃO / COMENTÁRIOS -> QUERY_INFO
  // ==========================================================================
  const isQueryAnalysis = 
    /\b(?:mantemos|manter|verifique|verificar|avalia|avalie|avaliar|deixamos|deixar|rodando|o que acha|o que você acha|como está|como esta|opinião|opiniao|analise|analisa|veja a posição|veja a posicao|como vai a operação|como vai a operacao|segura ou sai|devo sair|devemos sair|o que fazer|qual o cenário|qual o cenario|visão|visao|me diga|me passe)\b/i.test(rawTranscript) ||
    /\b(?:o que|como|quando|onde|qual|por que|porque|será que|sera que)\b/i.test(rawTranscript) ||
    // Comentários, argumentações, correções ou observações sem comando de ordem
    /\b(?:não pedi|nao pedi|não solicitei|nao solicitei|não mandei|nao mandei|apenas citei|apenas comentei|apenas disse|só disse|so disse|estou dizendo|estou comentando|estou falando|retrata|significa|indica|representa|sentimento|força de|forca de|olha o|veja o|repare|reparou|percebeu|observe|observação|observacao|corrigindo|discordo|na verdade|está errado|esta errado|não é assim|nao e assim)\b/i.test(rawTranscript) ||
    /^(?:não|nao)\s*,\s*(?:mas|eu|o|a|apenas|só|so|na verdade|isso)/i.test(rawTranscript.trim()) ||
    /\?$/.test(rawTranscript.trim());

  const hasExplicitActionCommand = 
    /\b(?:abra\s+(?:uma\s+)?(?:opera[cç][aã]o|ordem)|compre\s+\d+|venda\s+\d+|zerar|fechar\s+todas|cancele\s+todas|proteger|coloque\s+no\s+zero|breakeven|mova\s+o\s+stop|mova\s+o\s+take|ajuste\s+o\s+stop|ajuste\s+o\s+alvo)\b/i.test(norm);

  if (isQueryAnalysis && !hasExplicitActionCommand) {
    return {
      type: 'QUERY_INFO',
      rawText: rawTranscript,
      confidenceScore: 0.95
    };
  }

  // 1. INTENÇÃO: ZERAR / CANCELAR / ENCERRAR TODAS AS OPERAÇÕES DA CONTA
  if (/\bzerar\b|\bcancelar\b|\bcancele\b|\bfechar todas\b|\bfechar\s+posi[cç][aã]o\b|\bfechar\s+opera[cç][aã]o\b|\bencerre\b|\bencerrar\b|\bliquidar\b/i.test(norm)) {
    return {
      type: 'CLOSE_POSITION',
      rawText: rawTranscript,
      confidenceScore: 0.95
    };
  }

  // 2. INTENÇÃO: BREAK-EVEN / PROTEÇÃO NO PREÇO DE ENTRADA OU +X PONTOS
  const isBreakEven = 
    /\bbreak_even\b|\bbreakeven\b|\bbreak even\b|\bzero a zero\b|\b0 a 0\b|\b0x0\b|\bproteja\b|\bproteger\b|\bprotege\b|\bcoloque no zero\b|\bcoloque o stop no zero\b/i.test(norm) ||
    /(?:mova|coloque|ajuste|arraste|deixe)\s+(?:o\s+)?stop\s+(?:colocando\s+)?(?:na\s+entrada|no\s+pre[cç]o\s+de\s+entrada|no\s+ponto\s+de\s+entrada|em\s+0|no\s+zero)/i.test(norm) ||
    /(?:stop|posi[cç][aã]o)\s+(?:no\s+breakeven|na\s+entrada|no\s+zero)/i.test(norm);

  if (isBreakEven) {
    const offsetMatch = norm.match(/(?:a|com)\s+(\d+(?:\.\d+)?)\s+pontos?\s+(?:da|do)?\s*entrada/i);
    const protectOffset = offsetMatch ? parseFloat(offsetMatch[1]) : 0;

    return {
      type: 'BREAK_EVEN',
      protectOffsetPoints: protectOffset,
      rawText: rawTranscript,
      confidenceScore: 0.95
    };
  }

  // Helper para resolver nível de indicador
  const levels = context?.levels;
  const vp = context?.volumeProfile;

  const resolveIndicatorLevel = (name: string): number | undefined => {
    const n = name.toLowerCase();

    // 1. Suporte a GEX 1..10
    const gexMatch = n.match(/gex\s*(\d{1,2})/);
    if (gexMatch) {
      const idx = parseInt(gexMatch[1], 10);
      if (Array.isArray(levels?.gex) && levels.gex[idx - 1] !== undefined) return Number(levels.gex[idx - 1]);
      if (levels && levels[`gex_${idx}`] !== undefined) return Number(levels[`gex_${idx}`]);
      if (levels && levels[`gex${idx}`] !== undefined) return Number(levels[`gex${idx}`]);
    }
    if (n.includes('gex')) {
      if (Array.isArray(levels?.gex) && levels.gex[0] !== undefined) return Number(levels.gex[0]);
      if (levels?.gex) return Number(levels.gex);
    }

    // 2. Suporte a BL 1..10
    const blMatch = n.match(/bl\s*(\d{1,2})/);
    if (blMatch) {
      const idx = parseInt(blMatch[1], 10);
      if (Array.isArray(levels?.bl) && levels.bl[idx - 1] !== undefined) return Number(levels.bl[idx - 1]);
      if (levels && levels[`bl_${idx}`] !== undefined) return Number(levels[`bl_${idx}`]);
      if (levels && levels[`bl${idx}`] !== undefined) return Number(levels[`bl${idx}`]);
    }
    if (n.includes('bl')) {
      if (Array.isArray(levels?.bl) && levels.bl[0] !== undefined) return Number(levels.bl[0]);
      if (levels?.bl) return Number(levels.bl);
    }

    if (n.includes('gwall')) return levels?.gwall ? Number(levels.gwall) : undefined;
    if (n.includes('put0dte') || n.includes('put 0dte')) return levels?.put0dte || levels?.put ? Number(levels.put0dte || levels.put) : undefined;
    if (n.includes('call0dte') || n.includes('call 0dte')) return levels?.call0dte || levels?.call ? Number(levels.call0dte || levels.call) : undefined;
    if (n.includes('hvl0') || n.includes('hvl zero')) return levels?.hvl0 || levels?.hvl ? Number(levels.hvl0 || levels.hvl) : undefined;
    if (n.includes('hvl')) return levels?.hvl || levels?.hvl0 ? Number(levels.hvl || levels.hvl0) : undefined;
    if (n.includes('call_wall') || n.includes('call wall')) return levels?.call ? Number(levels.call) : undefined;
    if (n.includes('put_wall') || n.includes('put wall')) return levels?.put ? Number(levels.put) : undefined;
    if (n.includes('vah')) return vp?.vah ? Number(vp.vah) : undefined;
    if (n.includes('val')) return vp?.val ? Number(vp.val) : undefined;
    if (n.includes('vpoc') || n.includes('poc')) return vp?.vpoc ? Number(vp.vpoc) : undefined;
    return undefined;
  };

  // Lista de Indicadores Técnicos Prioritários
  const indicators = [
    'gwall', 'put0dte', 'call0dte', 'hvl0', 'hvl', 'vah', 'val', 'vpoc', 'call_wall', 'put_wall',
    'gex10', 'gex9', 'gex8', 'gex7', 'gex6', 'gex5', 'gex4', 'gex3', 'gex2', 'gex1', 'gex',
    'bl10', 'bl9', 'bl8', 'bl7', 'bl6', 'bl5', 'bl4', 'bl3', 'bl2', 'bl1', 'bl'
  ];

  // 3. INTENÇÃO: MOVER / AJUSTAR STOP LOSS DE POSIÇÃO ABERTA (PRECEDÊNCIA SOBRE ABERTURA)
  const isMoveStopCommand = 
    /(?:mova|mova o|desloque|arraste|coloque|coloque o|ajuste|ajuste o|posicione|posicione o|suba|des[cç]a|altere|altere o|mudar|mude|mude o|atualize|atualize o|puxe|puxe o)\s+(?:o\s+)?stop\b/i.test(norm) ||
    /stop\s+(?:loss\s+)?(?:para|em|no\s+pre[cç]o|no\s+n[ií]vel|no|na)\s+(\d{1,6}(?:[.,]\d+)?|[a-z0-9_]+)/i.test(norm);

  if (isMoveStopCommand) {
    let stopLevel: number | undefined = undefined;
    let deltaPoints: number | undefined = undefined;
    let direction: 'up' | 'down' | undefined = undefined;
    let indicatorStopName: string | undefined = undefined;
    let stopCandleReference: VoiceTradeIntent['stopCandleReference'] = undefined;

    // A. Preço fixo numérico direto (ex: "mova o stop para 29410.50", "coloque o stop em 29400", "stop no 29.480")
    const priceMatch = norm.match(/stop(?:\s*loss)?\s+(?:para\s+|em\s+|no\s+pre[cç]o\s+|no\s+n[ií]vel\s+|no\s+|na\s+)?(\d{1,6}(?:[.,]\d+)?)/i) ||
                       norm.match(/(?:mova|coloque|ajuste|altere|mude)\s+(?:o\s+)?stop(?:\s*loss)?\s+(?:para\s+|em\s+|no\s+pre[cç]o\s+|no\s+n[ií]vel\s+|no\s+|na\s+)?(\d{1,6}(?:[.,]\d+)?)/i);
    if (priceMatch) {
      const parsedRes = parsePriceOrPoints(priceMatch[1], context?.currentPrice);
      if (parsedRes?.price) {
        stopLevel = parsedRes.price;
      } else if (parsedRes?.points) {
        deltaPoints = parsedRes.points;
      }
    }

    // B. Delta em pontos (ex: "mova o stop 10 pontos acima/abaixo", "suba o stop 15 pontos")
    const deltaMatch = norm.match(/(?:stop\s+)?(\d+(?:[.,]\d+)?)\s+pontos?\s+(acima|abaixo|para cima|para baixo|a favor|contra)/i) ||
                       norm.match(/(?:mova|coloque|ajuste|altere|mude)\s+(?:o\s+)?stop\s+(\d+(?:[.,]\d+)?)\s+pontos?/i);
    if (deltaMatch) {
      const parsedRes = parsePriceOrPoints(deltaMatch[1], context?.currentPrice);
      if (parsedRes?.points) deltaPoints = parsedRes.points;
      else if (parsedRes?.price) stopLevel = parsedRes.price;
      const dirStr = deltaMatch[2] || '';
      direction = dirStr.includes('baixo') || dirStr.includes('contra') ? 'down' : 'up';
    }

    // C. Indicador Técnico (GWall, Put0dte, HVL0, HVL, VAH, VAL, VPOC, GEX 1..10, BL 1..10)
    for (const ind of indicators) {
      if (norm.includes(ind)) {
        indicatorStopName = ind.toUpperCase();
        stopLevel = resolveIndicatorLevel(ind);
        break;
      }
    }

    // D. Candle Reference
    if (/stop\s+(?:no\s+)?fundo\s+(?:do\s+)?candle\s+atual/i.test(norm)) {
      stopCandleReference = 'current_candle_low';
    } else if (/stop\s+(?:no\s+)?fundo\s+(?:de\s+1\s+candle\s+a\s+esquerda|do\s+candle\s+anterior)/i.test(norm)) {
      stopCandleReference = 'prior_candle_low';
    } else if (/stop\s+(?:na\s+)?m[aá]xima\s+(?:do\s+)?candle\s+atual/i.test(norm)) {
      stopCandleReference = 'current_candle_high';
    } else if (/stop\s+(?:na\s+)?m[aá]xima\s+(?:de\s+1\s+candle\s+a\s+esquerda|do\s+candle\s+anterior)/i.test(norm)) {
      stopCandleReference = 'prior_candle_high';
    }

    if (stopLevel || deltaPoints || indicatorStopName || stopCandleReference) {
      return {
        type: 'MOVE_STOP',
        stopLevel,
        deltaPoints,
        direction: direction || 'up',
        indicatorStopName,
        stopCandleReference,
        rawText: rawTranscript,
        confidenceScore: 0.95
      };
    }
  }

  // 4. INTENÇÃO: MOVER / AJUSTAR TAKE PROFIT (ALVO) DE POSIÇÃO ABERTA (PRECEDÊNCIA SOBRE ABERTURA)
  const isMoveTakeCommand = 
    /(?:mova|mova o|coloque|coloque o|ajuste|ajuste o|posicione|posicione o|aumente|estenda|altere|altere o|mudar|mude|mude o|atualize|atualize o|puxe|puxe o)\s+(?:o\s+)?(?:take|alvo|take profit|tp|lucro|meta)\b/i.test(norm) ||
    /(?:take|alvo|tp|take profit)\s+(?:para|em|no\s+pre[cç]o|no\s+n[ií]vel|no|na)\s+(\d{1,6}(?:[.,]\d+)?|[a-z0-9_]+)/i.test(norm);

  if (isMoveTakeCommand) {
    let takeLevel: number | undefined = undefined;
    let takePoints: number | undefined = undefined;
    let indicatorTakeName: string | undefined = undefined;

    // A. Preço fixo numérico direto (ex: "mova o alvo para 29550", "coloque o take em 29500", "alvo no 29.600", "take profit em 29650")
    const priceMatch = norm.match(/(?:take\s*profit|take|alvo|tp|meta)\s+(?:para\s+|em\s+|no\s+pre[cç]o\s+|no\s+n[ií]vel\s+|no\s+|na\s+)?(\d{1,6}(?:[.,]\d+)?)/i) ||
                       norm.match(/(?:mova|coloque|ajuste|altere|mude)\s+(?:o\s+)?(?:take\s*profit|take|alvo|tp|meta)\s+(?:para\s+|em\s+|no\s+pre[cç]o\s+|no\s+n[ií]vel\s+|no\s+|na\s+)?(\d{1,6}(?:[.,]\d+)?)/i);
    if (priceMatch) {
      const parsedRes = parsePriceOrPoints(priceMatch[1], context?.currentPrice);
      if (parsedRes?.price) {
        takeLevel = parsedRes.price;
      } else if (parsedRes?.points) {
        takePoints = parsedRes.points;
      }
    }

    // B. Delta em pontos
    const deltaMatch = norm.match(/(?:take\s*profit|take|alvo|tp)\s+(?:em\s+|com\s+|para\s+)?(\d+(?:[.,]\d+)?)\s*pontos?/i) ||
                       norm.match(/(?:mova|coloque|ajuste|altere|mude)\s+(?:o\s+)?(?:take\s*profit|take|alvo|tp)\s+(\d+(?:[.,]\d+)?)\s*pontos?/i);
    if (deltaMatch) {
      const parsedRes = parsePriceOrPoints(deltaMatch[1], context?.currentPrice);
      if (parsedRes?.points) takePoints = parsedRes.points;
      else if (parsedRes?.price) takeLevel = parsedRes.price;
    }

    // C. Indicador Técnico (GWall, Put0dte, HVL0, HVL, VAH, VAL, VPOC, GEX 1..10, BL 1..10)
    for (const ind of indicators) {
      if (norm.includes(ind)) {
        indicatorTakeName = ind.toUpperCase();
        takeLevel = resolveIndicatorLevel(ind);
        break;
      }
    }

    if (takeLevel || takePoints || indicatorTakeName) {
      return {
        type: 'UPDATE_TAKE',
        takeLevel,
        takePoints,
        indicatorTakeName,
        rawText: rawTranscript,
        confidenceScore: 0.95
      };
    }
  }

  // 5. INTENÇÃO: CONFIRMAÇÃO DE EXECUÇÃO DA RECOMENDAÇÃO ANTERIOR ("Pode executar?", "Executar", "Confirmo a entrada", "Execute a recomendação")
  const isExecuteConfirm = /\bpode executar\b|\bexecutar\b|\bexecuta\b|\bpode abrir\b|\bconfirmo a entrada\b|\bconfirmo\b|\bmanda bala\b|\benviar a ordem\b|\bcoloque a ordem\b|\bexecute a recomend|\bexecutar a recomend|\bexecute\b/i.test(norm);
  if (isExecuteConfirm) {
    let lastRec = context?.lastRecommendation;
    if (!lastRec && context?.chatHistory && context.chatHistory.length > 0) {
      for (let i = context.chatHistory.length - 1; i >= 0; i--) {
        const msg = context.chatHistory[i];
        if (msg.sender === 'copilot' || msg.sender === 'assistant' || msg.sender === 'system') {
          const extracted = extractRecommendationFromText(msg.text, context?.currentPrice);
          if (extracted && extracted.side) {
            lastRec = extracted;
            break;
          }
        }
      }
    }

    if (lastRec && lastRec.side) {
      return {
        type: 'OPEN_POSITION',
        side: lastRec.side,
        contracts: lastRec.contracts || 1,
        stopLevel: lastRec.stopLevel,
        takeLevel: lastRec.takeLevel,
        stopPoints: lastRec.stopPoints,
        takePoints: lastRec.takePoints,
        rawText: rawTranscript,
        confidenceScore: 0.95
      };
    } else {
      return {
        type: 'INCOMPLETE_ORDER',
        missingFields: ['Side', 'Stop Loss', 'Take Profit'],
        promptFeedback: 'Qual ordem você gostaria de executar? Por favor informe se é Compra ou Venda, com seu Stop Loss e Alvo desejados.',
        rawText: rawTranscript,
        confidenceScore: 0.95
      };
    }
  }

  // 6. INTENÇÃO: ABERTURA DE NOVA OPERAÇÃO OU COMPOSIÇÃO DE ORDEM COM MEMÓRIA DE HISTÓRICO
  const isBuy = /\bcompre\b|\bcompra\b|\blong\b|\bcomprado\b/i.test(norm) || /\babra\s+(?:uma\s+)?(?:opera[cç][aã]o\s+de\s+)?compre\b/i.test(norm);
  const isSell = /\bvenda\b|\bvende\b|\bshort\b|\bvendido\b/i.test(norm) || /\babra\s+(?:uma\s+)?(?:opera[cç][aã]o\s+de\s+)?venda\b/i.test(norm);
  const hasOrderKeywords = /\babra\s+(?:uma\s+)?(?:opera[cç][aã]o|ordem)\b/i.test(norm) ||
                           (/\bstop\b/i.test(norm) && /\btake\b/i.test(norm)) ||
                           (/\bstop\b/i.test(norm) && /\balvo\b/i.test(norm));

  // Memória contextual: se o usuário mandou apenas parâmetros de stop/alvo, resgatar o comando de abertura das últimas 4 mensagens
  let previousSide: 'COMPRA' | 'VENDA' | undefined = undefined;
  let previousContracts: number | undefined = undefined;

  if (context?.chatHistory && context.chatHistory.length > 0) {
    const recentMsgs = context.chatHistory.slice(-4);
    for (let i = recentMsgs.length - 1; i >= 0; i--) {
      const mText = normalizeVoiceText(recentMsgs[i].text || '');
      if (/\bcompre\b|\bcompra\b/i.test(mText) && !/\bvenda\b|\bvende\b/i.test(mText)) {
        previousSide = 'COMPRA';
      } else if (/\bvenda\b|\bvende\b/i.test(mText) && !/\bcompre\b|\bcompra\b/i.test(mText)) {
        previousSide = 'VENDA';
      }
      const cMatch = mText.match(/(\d+)\s+contratos?/i) || mText.match(/(\d+)\s+lotes?/i);
      if (cMatch && !previousContracts) {
        previousContracts = parseInt(cMatch[1], 10);
      }
      if (previousSide) break;
    }
  }

  const isParameterOnlyFollowUp = !isBuy && !isSell && (norm.includes('stop') || norm.includes('take')) && Boolean(previousSide);

  if (isBuy || isSell || hasOrderKeywords || isParameterOnlyFollowUp) {
    let side: 'COMPRA' | 'VENDA' | undefined = isBuy ? 'COMPRA' : isSell ? 'VENDA' : previousSide || context?.lastRecommendation?.side;

    if (!side) {
      if (/\balta\b|\bacima\b|\bcall\b/i.test(norm)) side = 'COMPRA';
      else if (/\bbaixa\b|\babaixo\b|\bput\b/i.test(norm)) side = 'VENDA';
    }

    if (!side && (norm.includes('stop') || norm.includes('take'))) {
      return {
        type: 'INCOMPLETE_ORDER',
        missingFields: ['Side (Compra ou Venda)'],
        promptFeedback: 'Você deseja abrir uma COMPRA ou uma VENDA com esses parâmetros?',
        rawText: rawTranscript,
        confidenceScore: 0.95
      };
    }

    if (!side) side = 'COMPRA';

    // A. Extração de Contratos
    let contracts: number | undefined = undefined;
    const contractsMatch = norm.match(/(\d+)\s+contratos?/i) || norm.match(/(\d+)\s+lotes?/i);
    if (contractsMatch) {
      contracts = parseInt(contractsMatch[1], 10);
    } else if (previousContracts) {
      contracts = previousContracts;
    }

    // B. Extração de Risco em Dólares ($)
    let riskUsd: number | undefined = undefined;
    const riskMatch = norm.match(/(?:com|de)\s+(\d+(?:\.\d+)?)\s*dolares?\s+(?:de\s+)?risco/i);
    if (riskMatch) {
      riskUsd = parseFloat(riskMatch[1]);
    }

    // C. Extração de Stop (em Pontos ou Preço)
    let stopPoints: number | undefined = undefined;
    let stopLevel: number | undefined = undefined;
    const stopPtsMatch = norm.match(/(?:use\s+o\s+|coloque\s+o\s+|com\s+|de\s+)?stop\s+(?:loss\s+)?(?:de\s+|com\s+|em\s+|no\s+|no\s+pre[cç]o\s+|no\s+n[ií]vel\s+)?(\d{1,6}(?:[.,]\d+)?)\s*(?:pontos?|pts?)?/i) ||
                         norm.match(/(\d{1,6}(?:[.,]\d+)?)\s+(?:pontos?|pts?)\s+(?:de\s+)?stop/i) ||
                         norm.match(/stop\s+(\d{1,6}(?:[.,]\d+)?)/i);
    if (stopPtsMatch) {
      const parsedRes = parsePriceOrPoints(stopPtsMatch[1], context?.currentPrice);
      if (parsedRes?.price) {
        stopLevel = parsedRes.price;
      } else if (parsedRes?.points) {
        stopPoints = parsedRes.points;
      }
    }

    // D. Extração de Take / Alvo (em Pontos ou Preço)
    let takePoints: number | undefined = undefined;
    let takeLevel: number | undefined = undefined;
    const takePtsMatch = norm.match(/(?:um\s+|e\s+um\s+|use\s+o\s+|com\s+|de\s+)?(?:take|alvo)\s+(?:profit\s+)?(?:de\s+|com\s+|em\s+|no\s+|no\s+pre[cç]o\s+|no\s+n[ií]vel\s+)?(\d{1,6}(?:[.,]\d+)?)\s*(?:pontos?|pts?)?/i) ||
                         norm.match(/(\d{1,6}(?:[.,]\d+)?)\s+(?:pontos?|pts?)\s+(?:de\s+)?(?:take|alvo)/i) ||
                         norm.match(/(?:take|alvo)\s+(\d{1,6}(?:[.,]\d+)?)/i);
    if (takePtsMatch) {
      const parsedRes = parsePriceOrPoints(takePtsMatch[1], context?.currentPrice);
      if (parsedRes?.price) {
        takeLevel = parsedRes.price;
      } else if (parsedRes?.points) {
        takePoints = parsedRes.points;
      }
    }

    // E. Extração de Multiplicador de Risco / Retorno (ex: "take ser 2x", "alvo 2x", "take 2 vezes o risco")
    let riskRewardMultiplier: number | undefined = undefined;
    const multMatch = norm.match(/(?:take|alvo|risco|retorno)\s+(?:ser\s+|de\s+|em\s+)?(\d+(?:[.,]\d+)?)\s*(?:x|vezes)?/i) ||
                      norm.match(/(\d+(?:[.,]\d+)?)\s*(?:x|vezes)\s*(?:o\s+)?(?:risco|stop|take|alvo)?/i);
    if (multMatch) {
      const val = parseFloat(multMatch[1].replace(',', '.'));
      if (val > 0 && val <= 20) {
        riskRewardMultiplier = val;
        if (stopPoints && !takePoints) {
          takePoints = stopPoints * riskRewardMultiplier;
        }
      }
    }

    // G. Resolução de Indicadores para Stop e Take
    let indicatorStopName: string | undefined = undefined;
    let indicatorTakeName: string | undefined = undefined;

    for (const ind of indicators) {
      if (norm.includes(`stop no ${ind}`) || norm.includes(`stop na ${ind}`) || norm.includes(`stop em ${ind}`)) {
        indicatorStopName = ind.toUpperCase();
        stopLevel = resolveIndicatorLevel(ind);
      }
      if (norm.includes(`take no ${ind}`) || norm.includes(`take na ${ind}`) || norm.includes(`take em ${ind}`) || norm.includes(`alvo no ${ind}`) || norm.includes(`alvo na ${ind}`)) {
        indicatorTakeName = ind.toUpperCase();
        takeLevel = resolveIndicatorLevel(ind);
      }
    }

    // H. NPOC por Data
    const npocMatch = norm.match(/npoc\s+(?:do\s+dia\s+|de\s+)?(\d{1,4}[-/]?\d{0,2}[-/]?\d{0,4}|\d{1,2})/i);
    if (npocMatch && vp?.nakedPocs && vp.nakedPocs.length > 0) {
      const queryDate = npocMatch[1].replace(/\s+/g, '');
      const foundPoc = vp.nakedPocs.find(p => (p.date && p.date.includes(queryDate)) || (p.timestamp && p.timestamp.includes(queryDate)));
      const pocPrice = foundPoc ? (foundPoc.price || foundPoc.poc) : (vp.nakedPocs[0]?.price || vp.nakedPocs[0]?.poc);
      if (pocPrice) {
        if (norm.includes('stop no npoc')) {
          indicatorStopName = `NPOC (${queryDate})`;
          stopLevel = Number(pocPrice);
        } else {
          indicatorTakeName = `NPOC (${queryDate})`;
          takeLevel = Number(pocPrice);
        }
      }
    }

    // I. Candle Reference
    let stopCandleReference: VoiceTradeIntent['stopCandleReference'] = undefined;
    if (/stop\s+(?:no\s+)?fundo\s+(?:do\s+)?candle\s+atual/i.test(norm)) {
      stopCandleReference = 'current_candle_low';
    } else if (/stop\s+(?:no\s+)?fundo\s+(?:de\s+1\s+candle\s+a\s+esquerda|do\s+candle\s+anterior)/i.test(norm)) {
      stopCandleReference = 'prior_candle_low';
    } else if (/stop\s+(?:na\s+)?m[aá]xima\s+(?:do\s+)?candle\s+atual/i.test(norm)) {
      stopCandleReference = 'current_candle_high';
    } else if (/stop\s+(?:na\s+)?m[aá]xima\s+(?:de\s+1\s+candle\s+a\s+esquerda|do\s+candle\s+anterior)/i.test(norm)) {
      stopCandleReference = 'prior_candle_high';
    }

    // Correção automática de confusão entre Preço e Pontos
    if (stopPoints && stopPoints >= 500) {
      stopLevel = stopPoints;
      stopPoints = undefined;
    } else if (stopLevel && stopLevel < 500) {
      stopPoints = stopLevel;
      stopLevel = undefined;
    }

    if (takePoints && takePoints >= 500) {
      takeLevel = takePoints;
      takePoints = undefined;
    } else if (takeLevel && takeLevel < 500) {
      takePoints = takeLevel;
      takeLevel = undefined;
    }

    // Dimensionamento por Risco em Dólares
    if (riskUsd && stopPoints && !contracts) {
      const pointVal = context?.pointValueUsd || 2.0;
      const calculatedContracts = Math.max(1, Math.floor(riskUsd / (stopPoints * pointVal)));
      contracts = calculatedContracts;
    }

    // Validação de Stop e Take
    const hasStop = Boolean(stopPoints || stopLevel || stopCandleReference || indicatorStopName);
    const hasTake = Boolean(takePoints || takeLevel || riskRewardMultiplier || indicatorTakeName);

    if (!hasStop || !hasTake) {
      const missing: string[] = [];
      if (!hasStop) missing.push('Stop Loss');
      if (!hasTake) missing.push('Take Profit (Alvo)');

      let feedback = '';
      if (!hasStop && !hasTake) {
        feedback = `Para sua segurança operacional, a ordem de ${side} não foi aberta porque faltam o Stop Loss e o Take Profit. Por favor informe seu stop e alvo.`;
      } else if (!hasStop) {
        feedback = `A ordem de ${side} requer a definição de um Stop Loss. Qual stop você deseja?`;
      } else {
        feedback = `A ordem de ${side} requer a definição de um Take Profit ou relação de risco. Qual o alvo desejado?`;
      }

      return {
        type: 'INCOMPLETE_ORDER',
        side,
        contracts: contracts || 1,
        stopPoints,
        takePoints,
        stopLevel,
        takeLevel,
        missingFields: missing,
        promptFeedback: feedback,
        rawText: rawTranscript,
        confidenceScore: 0.95
      };
    }

    return {
      type: 'OPEN_POSITION',
      side,
      contracts: contracts || 1,
      riskUsd,
      stopPoints,
      takePoints,
      riskRewardMultiplier,
      stopLevel,
      takeLevel,
      stopCandleReference,
      indicatorStopName,
      indicatorTakeName,
      rawText: rawTranscript,
      confidenceScore: 0.92
    };
  }

  // 7. SE NÃO FOR COMANDO OPERACIONAL -> CONSULTA / DIÁLOGO COM AXION
  return {
    type: 'QUERY_INFO',
    rawText: rawTranscript,
    confidenceScore: 0.85
  };
}
