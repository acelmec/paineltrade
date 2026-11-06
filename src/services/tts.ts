/**
 * VortexWeb — Módulo de Síntese de Voz (Text-to-Speech / TTS)
 * Suporte a:
 * 1. Groq Audio Speech API (canopylabs/orpheus-v1-english, playai/play3-mini)
 * 2. Gemini Audio Speech API (gemini-3.8-flash-lite-tts)
 * 3. OpenAI Audio Speech API (tts-1, tts-1-hd)
 * 4. Web Speech API Nativa do Navegador (PT-BR)
 */

export interface TTSOptions {
  enabled?: boolean;
  provider?: 'groq' | 'gemini' | 'openai' | 'browser';
  groqApiKey?: string;
  groqModel?: string;
  groqVoice?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  geminiVoice?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  openaiVoice?: string;
  browserVoiceName?: string;
  triggerMode?: 'all' | 'critical_only'; // 'critical_only' = apenas abertura, proteção/trailling, encerramento/gain/stop
  cooldownSeconds?: number;
  volume?: number;
  isCritical?: boolean;
}

let lastSpokenAt = 0;
let currentAudioElement: HTMLAudioElement | null = null;

/**
 * Retorna as vozes em Português instaladas no navegador / sistema operacional
 */
export function getAvailableBrowserVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return [];
  }
  const voices = window.speechSynthesis.getVoices();
  return voices.filter(v => v.lang.toLowerCase().includes('pt') || v.lang.toLowerCase().includes('por'));
}

/**
 * Interrompe qualquer áudio em reprodução atualmente
 */
export function stopSpeaking(): void {
  if (currentAudioElement) {
    currentAudioElement.pause();
    currentAudioElement.currentTime = 0;
    currentAudioElement = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Extrai o resumo executivo falado para áudio a partir de um texto completo do Copilot.
 * Remove métricas intermediárias, cálculos de passos e isola apenas a resposta final,
 * probabilidade ou recomendação de trading.
 */
export function extractSpokenSummary(rawText: string): string {
  if (!rawText || typeof rawText !== 'string') return '';

  let text = rawText.trim();

  // 1. Verificar se a IA forneceu uma tag explícita de fala <speech>...</speech> ou <audio>...</audio>
  const speechTagMatch = text.match(/<(?:speech|audio)>([\s\S]*?)<\/(?:speech|audio)>/i);
  if (speechTagMatch && speechTagMatch[1]?.trim()) {
    return cleanTextForSpeech(speechTagMatch[1].trim());
  }

  // 2. Remover tags de thinking se houver
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\/?think>/gi, '').trim();

  // 3. Caso: Cálculo de Nível / Fibonacci / Retração / Range
  // Exemplo: Linhas com Máxima, Mínima, Range e finalmente "Nível 61,8%: 29.674,57"
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const nivelLine = lines.find(l => /(?:nível|nivel|resultado|projetad[oa]|valor final)\s*(?:de\s*)?(?:\d+[,.]?\d*\s*%)?\s*:/i.test(l));
  const hasCalculationSteps = lines.some(l => /(?:máxima|maxima|mínima|minima|range)\s*:/i.test(l));

  if (nivelLine && hasCalculationSteps) {
    // Isolar o nível final e formatar de forma limpa para fala
    const cleanNivel = nivelLine
      .replace(/^[-*•\d.]+\s*/, '')
      .replace(/[*_`]/g, '')
      .replace(/\(≈.*?\)/g, '')
      .replace(/≈/g, 'aproximadamente')
      .trim();
    return cleanTextForSpeech(cleanNivel);
  }

  // 4. Caso: Análise de Mercado com Probabilidade / Recomendação / Decisão
  // Exemplo: Lista de dados técnicos (Preço atual, Gamma, Wall, Volume, Heatmap) seguido por Probabilidade e Recomendação
  const hasTechnicalDataList = lines.some(l => /(?:preço atual|gamma bias|wall de opções|volume institucional|heatmap|vpoc|vah|val)\s*:/i.test(l));
  const probIndex = text.search(/\*\*(?:Probabilidade|Cenário|Conclusão)\*\*/i);
  const recIndex = text.search(/\*\*(?:Recomendação|Ação|Operação|Trade)\*\*/i);

  if (hasTechnicalDataList && (probIndex !== -1 || recIndex !== -1)) {
    const startIndex = probIndex !== -1 ? probIndex : recIndex;
    const summaryPortion = text.substring(startIndex);
    return cleanTextForSpeech(summaryPortion);
  }

  // 5. Caso padrão: limpar texto geral
  return cleanTextForSpeech(text);
}

/**
 * Sanitiza e humaniza o texto para síntese de voz (TTS) em Português do Brasil:
 * - Converte jargões técnicos e siglas (SL -> Stop Loss, TP -> Take Profit, Long -> Compra, etc.)
 * - Ajusta números e pontuações para fala natural e fluida
 * - Remove marcadores visuais, emojis excessivos e limita suavemente em fim de frase
 */
export function cleanTextForSpeech(text: string): string {
  if (!text || typeof text !== 'string') return '';

  let t = text;

  // Remover tags HTML ou tags internas
  t = t.replace(/<(?:speech|audio)>([\s\S]*?)<\/(?:speech|audio)>/gi, '$1');
  t = t.replace(/<[^>]+>/g, ' ');

  // Remover links URLs
  t = t.replace(/https?:\/\/\S+/g, ' ');

  // Converter termos e siglas de trading para pronúncia humana e natural
  t = t
    .replace(/\bSL\b/gi, 'Stop Loss')
    .replace(/\bTP\b/gi, 'Take Profit')
    .replace(/\bLong\b/gi, 'Compra')
    .replace(/\bShort\b/gi, 'Venda')
    .replace(/\bcts\b/gi, 'contratos')
    .replace(/\bpts\b/gi, 'pontos')
    .replace(/\bmáx[‑\-]mín\b/gi, 'máxima e mínima')
    .replace(/\bmax[‑\-]min\b/gi, 'máxima e mínima')
    .replace(/\bmin\b/gi, 'mínima')
    .replace(/\bmax\b/gi, 'máxima')
    .replace(/≈/g, 'aproximadamente')
    .replace(/→/g, ', ')
    .replace(/–|—/g, ', ')
    .replace(/%/g, ' por cento');

  // Ajustar notação de números com espaços entre milhares para fala limpa (ex: "29 684,00" -> "29684,00")
  t = t.replace(/(\d+)\s+([0-9]{3})(?:[,.]([0-9]{1,2}))?/g, (_match, p1, p2, p3) => {
    return p3 ? `${p1}${p2},${p3}` : `${p1}${p2}`;
  });

  // Remover caracteres de markdown e estruturação visual
  t = t
    .replace(/[*_#`~[\]()]/g, ' ')
    .replace(/^\s*[-•–]\s*/gm, '') // Remove marcadores de lista no início de linhas
    .replace(/\s+/g, ' ')
    .trim();

  // Truncamento inteligente em limites de frase para evitar cortes no meio de palavras
  const maxLen = 320;
  if (t.length > maxLen) {
    const candidate = t.substring(0, maxLen);
    const lastPunctuation = Math.max(
      candidate.lastIndexOf('. '),
      candidate.lastIndexOf('! '),
      candidate.lastIndexOf('? '),
      candidate.lastIndexOf('; ')
    );

    if (lastPunctuation > 160) {
      t = candidate.substring(0, lastPunctuation + 1).trim();
    } else {
      // Se não achou ponto final, corta no último espaço
      const lastSpace = candidate.lastIndexOf(' ');
      t = (lastSpace > 160 ? candidate.substring(0, lastSpace) : candidate).trim() + '.';
    }
  }

  return t;
}

/**
 * Converte string base64 para Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const cleaned = (base64 || '').replace(/[\s\r\n]/g, '');
  const binaryString = window.atob(cleaned);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Empacota dados de áudio PCM brutos (16-bit mono) em um container WAV válido
 */
function pcmToWavBlob(pcmBytes: Uint8Array, sampleRate = 24000, numChannels = 1): Blob {
  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);
  // "RIFF"
  view.setUint32(0, 0x52494646, false);
  view.setUint32(4, 36 + pcmBytes.length, true);
  // "WAVE"
  view.setUint32(8, 0x57415645, false);
  // "fmt "
  view.setUint32(12, 0x666d7420, false);
  view.setUint32(16, 16, true); // Subchunk1Size (16 para PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 para PCM linear)
  view.setUint16(22, numChannels, true); // NumChannels
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * numChannels * 2, true); // ByteRate
  view.setUint16(32, numChannels * 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  // "data"
  view.setUint32(36, 0x64617461, false);
  view.setUint32(40, pcmBytes.length, true);

  return new Blob([wavHeader, pcmBytes as unknown as BlobPart], { type: 'audio/wav' });
}

/**
 * Sintetiza e reproduz o texto como áudio de acordo com as configurações do usuário
 */
export async function speakText(text: string, options: TTSOptions = {}): Promise<boolean> {
  if (!text || typeof text !== 'string' || text.trim().length === 0) return false;
  if (options.enabled === false) return false;

  const now = Date.now();
  const cooldownMs = (options.cooldownSeconds ?? 15) * 1000;
  const isCritical = Boolean(options.isCritical);

  // 1. Verificação de Modo de Gatilho (Esfriamento / Filtro Crítico)
  if (options.triggerMode === 'critical_only' && !isCritical) {
    return false;
  }

  // 2. Verificação de Cooldown (Não falar se o intervalo não tiver passado, exceto se for crítico)
  if (!isCritical && now - lastSpokenAt < cooldownMs) {
    return false;
  }

  // Processar e extrair o resumo executivo direto e foneticamente humanizado
  const textToSpeak = extractSpokenSummary(text);

  if (textToSpeak.length === 0) return false;

  const provider = options.provider || 'groq';
  const volume = Math.max(0.1, Math.min(1.0, options.volume ?? 1.0));

  try {
    stopSpeaking();

    // A. PROVEDOR GROQ AUDIO SPEECH
    if (provider === 'groq' && options.groqApiKey) {
      const model = options.groqModel || 'canopylabs/orpheus-v1-english';
      const voice = options.groqVoice || 'autumn';

      const response = await fetch('https://api.groq.com/openai/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${options.groqApiKey}`
        },
        body: JSON.stringify({
          model,
          voice,
          input: textToSpeak,
          response_format: 'wav'
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[TTS GROQ ERROR ${response.status}]: ${errText}. Usando fallback nativo...`);
        return speakNativeBrowser(textToSpeak, volume, options.browserVoiceName);
      }

      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      audio.volume = volume;
      currentAudioElement = audio;

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        if (currentAudioElement === audio) {
          currentAudioElement = null;
        }
      };

      await audio.play();
      lastSpokenAt = Date.now();
      return true;
    }

    // B. PROVEDOR GEMINI AUDIO SPEECH (TXT PARA VOZ / TTS)
    if (provider === 'gemini' && options.geminiApiKey) {
      const model = options.geminiModel || 'gemini-3.8-flash-lite-tts';
      const voice = options.geminiVoice || 'Puck';

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${options.geminiApiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: textToSpeak }]
            }
          ],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: voice
                }
              }
            }
          }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[TTS GEMINI ERROR ${response.status}]: ${errText}. Usando fallback nativo...`);
        return speakNativeBrowser(textToSpeak, volume, options.browserVoiceName);
      }

      const resJson = await response.json();
      const inlineData = resJson.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (!inlineData || !inlineData.data) {
        console.warn('[TTS GEMINI ERROR]: Dados de áudio ausentes na resposta. Usando fallback nativo...');
        return speakNativeBrowser(textToSpeak, volume, options.browserVoiceName);
      }

      const mimeType = inlineData.mimeType || 'audio/wav';
      let blob: Blob;

      if (mimeType.includes('pcm')) {
        let sampleRate = 24000;
        const rateMatch = mimeType.match(/rate=(\d+)/);
        if (rateMatch && rateMatch[1]) {
          sampleRate = parseInt(rateMatch[1], 10);
        }
        const pcmBytes = base64ToUint8Array(inlineData.data);
        blob = pcmToWavBlob(pcmBytes, sampleRate);
      } else {
        const rawBytes = base64ToUint8Array(inlineData.data);
        blob = new Blob([rawBytes as unknown as BlobPart], { type: mimeType });
      }

      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      audio.volume = volume;
      currentAudioElement = audio;

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        if (currentAudioElement === audio) {
          currentAudioElement = null;
        }
      };

      await audio.play();
      lastSpokenAt = Date.now();
      return true;
    }

    // C. PROVEDOR OPENAI AUDIO SPEECH
    if (provider === 'openai' && options.openaiApiKey) {
      const model = options.openaiModel || 'tts-1';
      const voice = options.openaiVoice || 'nova';

      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${options.openaiApiKey}`
        },
        body: JSON.stringify({
          model,
          voice,
          input: textToSpeak,
          response_format: 'mp3'
        })
      });

      if (!response.ok) {
        if (model === 'gpt-4o-mini-tts') {
          try {
            const fbResponse = await fetch('https://api.openai.com/v1/audio/speech', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${options.openaiApiKey}`
              },
              body: JSON.stringify({
                model: 'tts-1',
                voice,
                input: textToSpeak,
                response_format: 'mp3'
              })
            });
            if (fbResponse.ok) {
              const fbBlob = await fbResponse.blob();
              const fbAudioUrl = URL.createObjectURL(fbBlob);
              const fbAudio = new Audio(fbAudioUrl);
              fbAudio.volume = volume;
              currentAudioElement = fbAudio;
              fbAudio.onended = () => {
                URL.revokeObjectURL(fbAudioUrl);
                if (currentAudioElement === fbAudio) currentAudioElement = null;
              };
              await fbAudio.play();
              lastSpokenAt = Date.now();
              return true;
            }
          } catch {}
        }
        const errText = await response.text();
        console.warn(`[TTS OPENAI ERROR ${response.status}]: ${errText}. Usando fallback nativo...`);
        return speakNativeBrowser(textToSpeak, volume, options.browserVoiceName);
      }

      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      audio.volume = volume;
      currentAudioElement = audio;

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        if (currentAudioElement === audio) {
          currentAudioElement = null;
        }
      };

      await audio.play();
      lastSpokenAt = Date.now();
      return true;
    }

    // D. PROVEDOR NATIVO DO NAVEGADOR (WEB SPEECH API)
    return speakNativeBrowser(textToSpeak, volume, options.browserVoiceName);

  } catch (err) {
    console.warn('[TTS ERROR]', err);
    return speakNativeBrowser(textToSpeak, volume, options.browserVoiceName);
  }
}

/**
 * Provedor Nativo usando Web Speech API do navegador em Português
 */
function speakNativeBrowser(text: string, volume: number = 1.0, preferredVoiceName?: string): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return false;
  }

  try {
    // Garante que o sintetizador do Chrome não está em estado de pausa/congelamento
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.volume = volume;
    utterance.rate = 1.08; // Ritmo dinâmico, natural e enxuto para trading
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    let selectedVoice: SpeechSynthesisVoice | undefined;

    if (preferredVoiceName) {
      selectedVoice = voices.find(v => v.name === preferredVoiceName);
    }

    if (!selectedVoice) {
      // Priorizar vozes pt-BR naturais de qualidade do Windows/Google/Edge
      selectedVoice = voices.find(v => {
        const n = v.name.toLowerCase();
        const l = v.lang.toLowerCase();
        return (l.includes('pt-br') || l.startsWith('pt')) && (n.includes('natural') || n.includes('neural') || n.includes('google') || n.includes('francisca') || n.includes('antonio') || n.includes('maria') || n.includes('daniel'));
      }) ||
      voices.find(v => v.lang.replace('_', '-').toLowerCase().includes('pt-br')) ||
      voices.find(v => v.lang.toLowerCase().startsWith('pt'));
    }

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    window.speechSynthesis.speak(utterance);
    lastSpokenAt = Date.now();
    return true;
  } catch (err) {
    console.error('[TTS Native Fallback Fail]', err);
    return false;
  }
}

