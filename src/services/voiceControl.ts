// ============================================================================
// Voice Control Universal Multiplataforma (Web, Android, Tauri V2)
// Suporte nativo ao Português do Brasil (pt-BR) com fallback Whisper Groq
// ============================================================================

export interface VoiceRecognitionOptions {
  language?: string; // Padrão: 'pt-BR'
  groqApiKey?: string;
  onStart?: () => void;
  onResult?: (transcript: string) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}

export class VoiceRecognitionManager {
  private recognition: any = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private isListening: boolean = false;
  private stream: MediaStream | null = null;
  private options: VoiceRecognitionOptions = {};

  constructor() {
    // Verificar se Web Speech Recognition nativo está disponível
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          this.recognition = new SpeechRecognition();
          this.recognition.lang = 'pt-BR';
          this.recognition.continuous = false;
          this.recognition.interimResults = false;
          this.recognition.maxAlternatives = 1;
        } catch (e) {
          console.warn('[VoiceControl] Falha ao instanciar SpeechRecognition nativo:', e);
          this.recognition = null;
        }
      }
    }
  }

  public isSupported(): boolean {
    if (this.recognition) return true;
    if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
      return true; // Suporte via MediaRecorder + Whisper
    }
    return false;
  }

  public getIsListening(): boolean {
    return this.isListening;
  }

  public async startListening(options: VoiceRecognitionOptions = {}): Promise<void> {
    if (this.isListening) {
      this.stopListening();
      return;
    }

    this.options = options;
    const lang = options.language || 'pt-BR';

    // 1. Tentar Web Speech Recognition Nativo (Desktop Chrome/Edge e Android)
    if (this.recognition) {
      try {
        this.recognition.lang = lang;

        this.recognition.onstart = () => {
          this.isListening = true;
          if (this.options.onStart) this.options.onStart();
        };

        this.recognition.onresult = (event: any) => {
          const results = event.results;
          if (results && results.length > 0) {
            const transcript = results[0][0]?.transcript || '';
            if (transcript && this.options.onResult) {
              this.options.onResult(transcript.trim());
            }
          }
        };

        this.recognition.onerror = (event: any) => {
          const err = event.error || 'Erro no reconhecimento de voz';
          console.warn('[VoiceControl SpeechRecognition Error]:', err);
          if (err === 'not-allowed') {
            if (this.options.onError) this.options.onError('Permissão de microfone negada no navegador.');
          } else if (err === 'no-speech') {
            // Silêncio, não notificar erro agressivo
          } else {
            // Fallback para MediaRecorder se SpeechRecognition falhar no ambiente
            this.fallbackToMediaRecorder(options);
            return;
          }
          this.isListening = false;
        };

        this.recognition.onend = () => {
          this.isListening = false;
          if (this.options.onEnd) this.options.onEnd();
        };

        this.recognition.start();
        return;
      } catch (err: any) {
        console.warn('[VoiceControl] Falha ao iniciar reconhecimento nativo, tentando fallback:', err);
      }
    }

    // 2. Fallback Multiplataforma via MediaRecorder + Whisper (Tauri V2 / WebView2)
    await this.fallbackToMediaRecorder(options);
  }

  private async fallbackToMediaRecorder(options: VoiceRecognitionOptions): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (options.onError) options.onError('Captura de microfone não suportada neste dispositivo.');
      return;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(this.stream);
      this.audioChunks = [];

      this.mediaRecorder.onstart = () => {
        this.isListening = true;
        if (options.onStart) options.onStart();
      };

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        this.isListening = false;
        if (this.stream) {
          this.stream.getTracks().forEach(t => t.stop());
          this.stream = null;
        }

        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.audioChunks = [];

        if (audioBlob.size > 1000 && options.groqApiKey) {
          try {
            const transcript = await this.transcribeWithGroqWhisper(audioBlob, options.groqApiKey);
            if (transcript && options.onResult) {
              options.onResult(transcript);
            }
          } catch (e: any) {
            console.error('[Whisper Transcribe Error]:', e);
            if (options.onError) options.onError(`Erro ao transcrever áudio: ${e.message || e}`);
          }
        }

        if (options.onEnd) options.onEnd();
      };

      this.mediaRecorder.start();
    } catch (err: any) {
      this.isListening = false;
      console.error('[VoiceControl MediaRecorder Error]:', err);
      if (options.onError) options.onError('Não foi possível acessar o microfone.');
    }
  }

  private async transcribeWithGroqWhisper(audioBlob: Blob, apiKey: string): Promise<string> {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('language', 'pt'); // Forçar Português do Brasil (pt)
    formData.append('temperature', '0.0');
    formData.append('prompt', 'Comandos de Trading em Português: Compra, Venda, Stop Loss, Take Profit, Break Even, Pontos, Contratos, GWall, Put0dte, Call0dte, HVL, HVL0, VAH, VAL, VPOC, NPOC.');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Whisper API Error (${res.status}): ${err}`);
    }

    const json = await res.json();
    return json.text ? json.text.trim() : '';
  }

  public stopListening(): void {
    this.isListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
    }
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      try {
        this.mediaRecorder.stop();
      } catch {}
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  }
}

export const globalVoiceRecognition = new VoiceRecognitionManager();
