export interface AIRequestData {
  provider: 'groq' | 'gemini' | 'openai';
  apiKey: string;
  model: string;
  symbol: string;
  price: string;
  zScore: number;
  atrRatio: number;
  sentiment: number;
  delta: number;
  deltaRatio: number;
  prints: number;
  forces: { symbol: string; buy: number; sell: number }[];
  blockTrades: string[];
  news: string[];
  levels: { [key: string]: string };
  screenshotBase64?: string; // Imagem do gráfico em base64 se disponível
  promptTemplate?: string;
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
  error?: string;
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
    promptTemplate
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

  // Montar JSON contendo os dados do mercado
  const marketContext = {
    symbol,
    price,
    indicators: {
      zScore,
      atrRatio,
      sentimentValue: sentiment,
      delta,
      deltaRatio,
      printsPerSecond: prints
    },
    forces: forces.map(f => `${f.symbol}: Compra ${f.buy}%, Venda ${f.sell}%`).join(' | '),
    blockTrades: blockTrades.slice(0, 10), // últimas 10 ordens grandes
    relevantLevels: levels,
    newsCountdowns: news.slice(0, 5) // Últimas notícias
  };

  const defaultPrompt = `Você é um analista de trading de alta precisão (Vortex AI).
Analise o contexto do mercado abaixo e decida se há um sinal claro de COMPRA, VENDA, SAIR ou AGUARDANDO.

DADOS DO MERCADO:
${JSON.stringify(marketContext, null, 2)}

Você deve responder EXCLUSIVAMENTE em formato JSON puro, seguindo exatamente esta estrutura:
{
  "sinal": "COMPRA" | "VENDA" | "SAIR" | "AGUARDANDO",
  "confianca": "percentual de confiança, ex: 85%",
  "alvo": "preço alvo sugerido ou '--'",
  "stop": "preço de stop loss sugerido ou '--'",
  "resumo": "Explicação curta e lógica em português para a tomada de decisão baseada nos níveis de suporte/resistência, sentimento e delta de agressão.",
  "gatilho": "Gatilho técnico rápido que confirmou a entrada ou '--'",
  "alerta": "Informação de alerta de risco relevante (ex: notícia iminente) ou '--'"
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
      responseText = await callGeminiAPI(apiKey, model, finalPrompt, screenshotBase64);
    } else {
      throw new Error(`Provedor de IA desconhecido: ${provider}`);
    }

    // Tentar limpar e extrair JSON da resposta
    const jsonStart = responseText.indexOf('{');
    const jsonEnd = responseText.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error('A resposta da IA não contém um bloco JSON válido.');
    }
    const cleanJsonStr = responseText.substring(jsonStart, jsonEnd + 1);
    const result = JSON.parse(cleanJsonStr);

    return {
      success: true,
      sinal: result.sinal || 'AGUARDANDO',
      confianca: result.confianca || '0%',
      alvo: result.alvo || '--',
      stop: result.stop || '--',
      resumo: result.resumo || 'Análise concluída.',
      gatilho: result.gatilho || '--',
      alerta: result.alerta || '--'
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

// 1. Chamada Groq API
async function callGroqAPI(apiKey: string, model: string, prompt: string, base64Image?: string): Promise<string> {
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  
  const messages: any[] = [];
  
  // Groq exige que a palavra 'json' apareça em algum lugar na lista de mensagens (geralmente nas instruções do sistema ou prompt do usuário) para usar response_format: { type: 'json_object' }
  messages.push({
    role: 'system',
    content: 'Você é um analisador técnico que responde estritamente no formato JSON.'
  });

  if (base64Image) {
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
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API Error (${response.status}): ${errText}`);
  }

  const resJson = await response.json();
  return resJson.choices[0]?.message?.content || '';
}

// 2. Chamada OpenAI API (GPT)
async function callOpenAI(apiKey: string, model: string, prompt: string, base64Image?: string): Promise<string> {
  const url = 'https://api.openai.com/v1/chat/completions';
  
  const messages: any[] = [];
  
  if (base64Image) {
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
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API Error (${response.status}): ${errText}`);
  }

  const resJson = await response.json();
  return resJson.choices[0]?.message?.content || '';
}

// 3. Chamada Gemini API (Native / OpenAI Compatible)
async function callGeminiAPI(apiKey: string, model: string, prompt: string, base64Image?: string): Promise<string> {
  // Vamos usar o endpoint nativo do Gemini 1.5 que aceita imagens facilmente.
  // URL: https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const contents: any = {
    parts: []
  };

  contents.parts.push({ text: prompt });

  if (base64Image) {
    contents.parts.push({
      inlineData: {
        mimeType: 'image/png',
        data: base64Image
      }
    });
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: contents.parts }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json'
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API Error (${response.status}): ${errText}`);
  }

  const resJson = await response.json();
  return resJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
}
