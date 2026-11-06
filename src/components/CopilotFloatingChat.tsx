import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { globalVoiceRecognition } from '../services/voiceControl';
import { parseVoiceTradeCommand, parsePriceOrPoints, extractRecommendationFromText } from '../services/voiceTradeParser';

export interface CopilotChatMessage {
  id: string;
  sender: 'copilot' | 'user' | 'system';
  timestamp: string;
  text: string;
  thought?: string;
  signal?: 'COMPRA' | 'VENDA' | 'SAIR' | 'AGUARDANDO';
  action?: 'OPEN' | 'HOLD' | 'TRAIL_STOP' | 'BREAK_EVEN' | 'CLOSE' | 'TAKE_PROFIT';
  targetPrice?: string;
  stopPrice?: string;
}

interface CopilotFloatingChatProps {
  currentPage?: string;
}

export const CopilotFloatingChat: React.FC<CopilotFloatingChatProps> = ({ currentPage = 'dashboard' }) => {
  const {
    aiEnabled,
    isAnalyzing,
    askCopilotChatMessage,
    executeVoiceTradeCommand,
    setIsCopilotModalOpen,
    activePanel,
    settings,
    saveSettings,
    gammaLevels,
    volumeProfile
  } = useApp() as any;

  const [isOpen, setIsOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('vortex_copilot_chat_open');
      return saved ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  // Posição do Botão Flutuante (Direita Padrão ou Esquerda)
  const [buttonPosition, setButtonPosition] = useState<'right' | 'left'>(() => {
    try {
      return settings?.copilot_button_position || (localStorage.getItem('vortex_copilot_btn_pos') as any) || 'right';
    } catch {
      return 'right';
    }
  });

  // Sincronizar mudança de posição do botão vinda de settings ou eventos customizados
  useEffect(() => {
    if (settings?.copilot_button_position) {
      setButtonPosition(settings.copilot_button_position);
    }
  }, [settings?.copilot_button_position]);

  useEffect(() => {
    const handlePosChanged = (e: any) => {
      if (e.detail?.position) {
        setButtonPosition(e.detail.position);
      }
    };
    window.addEventListener('vortex_copilot_btn_pos_changed', handlePosChanged);
    return () => window.removeEventListener('vortex_copilot_btn_pos_changed', handlePosChanged);
  }, []);

  // Estado de Ancoragem (Docked junto ao balão do chat vs Flutuante Livre na tela)
  const [isDocked, setIsDocked] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('vortex_copilot_chat_docked');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  // Posição livre quando desancorado
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem('vortex_copilot_chat_pos');
      if (saved) return JSON.parse(saved);
    } catch {}
    const defaultX = typeof window !== 'undefined'
      ? (buttonPosition === 'left' ? 90 : Math.max(20, window.innerWidth - 450))
      : 100;
    const defaultY = typeof window !== 'undefined' ? Math.max(20, window.innerHeight - 620) : 100;
    return { x: defaultX, y: defaultY };
  });

  // Dimensões customizáveis persistidas (Redimensionável)
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>(() => {
    try {
      const savedW = localStorage.getItem('vortex_copilot_chat_width');
      const savedH = localStorage.getItem('vortex_copilot_chat_height');
      return {
        width: savedW ? Math.max(340, Math.min(920, Number(savedW))) : 410,
        height: savedH ? Math.max(420, Math.min(880, Number(savedH))) : 540
      };
    } catch {
      return { width: 410, height: 540 };
    }
  });

  const [messages, setMessages] = useState<CopilotChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('vortex_copilot_boleta_history');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      {
        id: 'msg_init',
        sender: 'copilot',
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        text: 'Axion 360° pronto. Monitorando fluxo, gamma e confluências de mercado.',
        thought: 'Sistemas calibrados. Pronto para orientar ou analisar sob demanda.'
      }
    ];
  });

  const [inputValue, setInputValue] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const feedEndRef = useRef<HTMLDivElement | null>(null);
  const cardContainerRef = useRef<HTMLDivElement | null>(null);

  // Escala tipográfica dinâmica e equilibrada baseada no tamanho do card
  const scale = useMemo(() => {
    const w = dimensions.width;
    if (w >= 620) {
      return {
        isLarge: true,
        headerTitle: 'text-sm font-black',
        headerSub: 'text-[10.5px]',
        chipText: 'text-[10.5px] py-1.5 px-2',
        authorText: 'text-[10.5px]',
        msgText: 'text-[13px] leading-relaxed',
        thoughtText: 'text-[11.5px]',
        badgeText: 'text-[10px] px-2 py-0.5',
        inputText: 'text-xs py-2 px-3',
        inputBtn: 'text-xs px-3.5 py-2',
        msgPadding: 'p-3',
        containerGap: 'space-y-2.5'
      };
    } else if (w >= 480) {
      return {
        isLarge: false,
        headerTitle: 'text-xs font-black',
        headerSub: 'text-[10px]',
        chipText: 'text-[10px] py-1 px-1.5',
        authorText: 'text-[9.5px]',
        msgText: 'text-[11.5px] leading-relaxed',
        thoughtText: 'text-[10.5px]',
        badgeText: 'text-[9px] px-1.5 py-0.5',
        inputText: 'text-[11px] py-1.5 px-2.5',
        inputBtn: 'text-xs px-3 py-1.5',
        msgPadding: 'p-2.5',
        containerGap: 'space-y-2'
      };
    } else {
      return {
        isLarge: false,
        headerTitle: 'text-xs font-black',
        headerSub: 'text-[9px]',
        chipText: 'text-[9px] py-1 px-1',
        authorText: 'text-[9px]',
        msgText: 'text-[10.5px] leading-snug',
        thoughtText: 'text-[9.5px]',
        badgeText: 'text-[8.5px] px-1.5 py-0.5',
        inputText: 'text-[10.5px] py-1.5 px-2.5',
        inputBtn: 'text-xs px-3 py-1.5',
        msgPadding: 'p-2',
        containerGap: 'space-y-2'
      };
    }
  }, [dimensions.width]);

  // Salvar estado de aberto/fechado
  useEffect(() => {
    try {
      localStorage.setItem('vortex_copilot_chat_open', JSON.stringify(isOpen));
    } catch {}
    if (isOpen) {
      setUnreadCount(0);
    }
  }, [isOpen]);

  // Persistir ancoragem
  const toggleDockMode = () => {
    setIsDocked(prev => {
      const next = !prev;
      try {
        localStorage.setItem('vortex_copilot_chat_docked', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Persistir mensagens
  useEffect(() => {
    try {
      localStorage.setItem('vortex_copilot_boleta_history', JSON.stringify(messages.slice(-30)));
    } catch {}
  }, [messages]);

  // Auto scroll suave para a última mensagem quando aberto
  useEffect(() => {
    if (isOpen) {
      feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isSending, isAnalyzing, isOpen]);

  const cleanMessageDisplay = (rawText?: string): string => {
    if (!rawText) return '';
    let t = rawText
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<think>[\s\S]*$/gi, '')
      .replace(/<\/?think>/gi, '')
      .replace(/<(?:speech|audio)>[\s\S]*?<\/(?:speech|audio)>/gi, '')
      .replace(/<\/?(?:speech|audio)>/gi, '')
      .replace(/^(?:Here(?:'s| is) a thinking process:?|Thinking Process:?|Thought Process:?|Let me think through this:?)[\s\S]*?(?=\n\n|\n[A-Z0-9{"'])/i, '')
      .trim();

    // Desempacotar automaticamente se veio em wrapper JSON (ex: { "resposta": "..." })
    if (t.startsWith('{') && t.endsWith('}')) {
      try {
        const parsed = JSON.parse(t);
        if (typeof parsed === 'object' && parsed !== null) {
          const inner = parsed.resposta || parsed.response || parsed.text || parsed.content || parsed.message || parsed.resumo || parsed.analysis;
          if (inner && typeof inner === 'string') {
            t = inner.trim();
          }
        }
      } catch {}
    } else {
      const mdMatch = t.match(/^```(?:json)?\s*(\{[\s\S]*?\})\s*```$/i);
      if (mdMatch && mdMatch[1]) {
        try {
          const parsed = JSON.parse(mdMatch[1]);
          const inner = parsed.resposta || parsed.response || parsed.text || parsed.content || parsed.message || parsed.resumo || parsed.analysis;
          if (inner && typeof inner === 'string') {
            t = inner.trim();
          }
        } catch {}
      }
    }

    return t;
  };

  // Listener para capturar pensamentos e análises geradas pelo ciclo do robô / IA
  useEffect(() => {
    const handleCopilotThought = (e: any) => {
      const { signal, alvo, stop, resumo, copilotThought, tradeAction } = e.detail || {};
      if (!resumo && !copilotThought) return;

      const cleanedText = cleanMessageDisplay(copilotThought || resumo);
      const cleanedThought = resumo && resumo !== copilotThought ? cleanMessageDisplay(resumo) : undefined;
      if (!cleanedText) return;

      const newMsg: CopilotChatMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        sender: 'copilot',
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        text: cleanedText,
        thought: cleanedThought,
        signal: signal,
        action: tradeAction,
        targetPrice: alvo && alvo !== '--' ? alvo : undefined,
        stopPrice: stop && stop !== '--' ? stop : undefined
      };

      setMessages(prev => [...prev.slice(-25), newMsg]);
      if (!isOpen) {
        setUnreadCount(prev => prev + 1);
      }
    };

    window.addEventListener('vortex_copilot_thought', handleCopilotThought);
    return () => window.removeEventListener('vortex_copilot_thought', handleCopilotThought);
  }, [isOpen]);

  // --- ARRASTO DA JANELA (MOVE LIVREMENTE NA TELA) ---
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number }>({
    mouseX: 0,
    mouseY: 0,
    startX: 0,
    startY: 0
  });

  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('.resize-handle')) {
      return;
    }

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    let initialX = position.x;
    let initialY = position.y;

    if (isDocked && cardContainerRef.current) {
      const rect = cardContainerRef.current.getBoundingClientRect();
      initialX = rect.left;
      initialY = rect.top;
      setPosition({ x: initialX, y: initialY });
      setIsDocked(false);
      try {
        localStorage.setItem('vortex_copilot_chat_docked', 'false');
      } catch {}
    }

    isDraggingRef.current = true;
    dragStartRef.current = {
      mouseX: clientX,
      mouseY: clientY,
      startX: initialX,
      startY: initialY
    };

    const handleMouseMove = (moveEvent: MouseEvent | TouchEvent) => {
      if (!isDraggingRef.current) return;
      const currentX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const currentY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;

      const deltaX = currentX - dragStartRef.current.mouseX;
      const deltaY = currentY - dragStartRef.current.mouseY;

      const maxX = Math.max(10, window.innerWidth - dimensions.width - 10);
      const maxY = Math.max(10, window.innerHeight - dimensions.height - 10);

      const nextX = Math.max(10, Math.min(maxX, dragStartRef.current.startX + deltaX));
      const nextY = Math.max(10, Math.min(maxY, dragStartRef.current.startY + deltaY));

      setPosition({ x: nextX, y: nextY });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);

      setPosition(current => {
        try {
          localStorage.setItem('vortex_copilot_chat_pos', JSON.stringify(current));
        } catch {}
        return current;
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleMouseMove);
    window.addEventListener('touchend', handleMouseUp);
  }, [position, isDocked, dimensions]);

  // --- REDIMENSIONAMENTO MULTIDIRECIONAL (TOP-LEFT, BOTTOM-RIGHT, BORDAS) ---
  const isResizingRef = useRef<boolean>(false);
  const resizeStartRef = useRef<{ x: number; y: number; width: number; height: number }>({
    x: 0,
    y: 0,
    width: 410,
    height: 540
  });

  const handleResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent, mode: 'top-left' | 'bottom-right' | 'top' | 'bottom' | 'left' | 'right') => {
    e.preventDefault();
    e.stopPropagation();
    isResizingRef.current = true;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    resizeStartRef.current = {
      x: clientX,
      y: clientY,
      width: dimensions.width,
      height: dimensions.height
    };

    const handleMouseMove = (moveEvent: MouseEvent | TouchEvent) => {
      if (!isResizingRef.current) return;
      const currentX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const currentY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;

      const deltaXFromStart = currentX - resizeStartRef.current.x;
      const deltaYFromStart = currentY - resizeStartRef.current.y;

      const maxWidth = Math.min(window.innerWidth - 30, 940);
      const maxHeight = Math.min(window.innerHeight - 100, 890);

      let nextWidth = resizeStartRef.current.width;
      let nextHeight = resizeStartRef.current.height;

      // Se redimensionar por TOP ou TOP-LEFT (arrastar para cima AUMENTA)
      if (mode === 'top' || mode === 'top-left') {
        nextHeight = Math.max(400, Math.min(maxHeight, resizeStartRef.current.height - deltaYFromStart));
      }
      // Se redimensionar por BOTTOM ou BOTTOM-RIGHT (arrastar para baixo AUMENTA)
      if (mode === 'bottom' || mode === 'bottom-right') {
        nextHeight = Math.max(400, Math.min(maxHeight, resizeStartRef.current.height + deltaYFromStart));
      }
      // Se redimensionar por LEFT ou TOP-LEFT (arrastar para esquerda AUMENTA)
      if (mode === 'left' || mode === 'top-left') {
        nextWidth = Math.max(340, Math.min(maxWidth, resizeStartRef.current.width - deltaXFromStart));
      }
      // Se redimensionar por RIGHT ou BOTTOM-RIGHT (arrastar para direita AUMENTA)
      if (mode === 'right' || mode === 'bottom-right') {
        nextWidth = Math.max(340, Math.min(maxWidth, resizeStartRef.current.width + deltaXFromStart));
      }

      setDimensions({ width: nextWidth, height: nextHeight });
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);

      setDimensions(current => {
        try {
          localStorage.setItem('vortex_copilot_chat_width', current.width.toString());
          localStorage.setItem('vortex_copilot_chat_height', current.height.toString());
        } catch {}
        return current;
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleMouseMove);
    window.addEventListener('touchend', handleMouseUp);
  }, [dimensions]);

  const [isVoiceListening, setIsVoiceListening] = useState<boolean>(false);

  // Helper para extrair a última recomendação emitida pelo Axion para responder a "Pode executar?"
  // Delega ao extractRecommendationFromText que normaliza Unicode (espaços e hifens não-quebráveis do Axion)
  const extractLastRecommendation = useCallback(() => {
    const curPriceNum = activePanel
      ? parseFloat(String(activePanel.price).replace(/[^\d.]/g, ''))
      : undefined;
    const copilotMsgs = [...messages].reverse().filter(m => m.sender === 'copilot');
    for (const msg of copilotMsgs) {
      // Tentar via campos estruturados primeiro (signal / stopPrice / targetPrice)
      if (msg.signal === 'COMPRA' || msg.signal === 'VENDA') {
        const side = msg.signal;
        let stopLevel: number | undefined;
        let stopPoints: number | undefined;
        let takeLevel: number | undefined;
        let takePoints: number | undefined;
        if (msg.stopPrice) {
          const p = parsePriceOrPoints(msg.stopPrice, curPriceNum);
          if (p?.price) stopLevel = p.price; else if (p?.points) stopPoints = p.points;
        }
        if (msg.targetPrice) {
          const p = parsePriceOrPoints(msg.targetPrice, curPriceNum);
          if (p?.price) takeLevel = p.price; else if (p?.points) takePoints = p.points;
        }
        if (stopLevel || stopPoints || takeLevel || takePoints) {
          return { side, stopLevel, takeLevel, stopPoints, takePoints, text: msg.text };
        }
      }
      // Fallback: extrator universal com sanitização Unicode
      const extracted = extractRecommendationFromText(msg.text || '', curPriceNum);
      if (extracted && extracted.side) {
        return extracted;
      }
    }
    return undefined;
  }, [messages, activePanel]);

  // Envio de mensagens / demandas para o Axion (Texto ou Atalhos)
  const handleSendMessage = async (customPrompt?: string, skipAddingUserMessage: boolean = false) => {
    const promptToSend = customPrompt || inputValue;
    if (!promptToSend.trim() || isSending) return;

    if (!skipAddingUserMessage) {
      const userMsg: CopilotChatMessage = {
        id: `usr_${Date.now()}`,
        sender: 'user',
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        text: promptToSend
      };
      setMessages(prev => [...prev, userMsg]);
    }
    if (!customPrompt) setInputValue('');

    const panelData = activePanel || {};
    const candles = panelData.candles || [];
    const curPriceNum = Number(panelData.price || 0);

    const context = {
      currentPrice: curPriceNum,
      currentCandle: candles[candles.length - 1],
      priorCandle: candles[candles.length - 2],
      pointValueUsd: Number(settings?.point_value_usd || 2.0),
      levels: panelData.levels || panelData.gammaLevels || gammaLevels,
      volumeProfile: panelData.volumeProfile || volumeProfile,
      lastRecommendation: extractLastRecommendation(),
      chatHistory: messages.slice(-4)
    };

    // Verificar se o texto digitado é um comando operacional direto (ex: "Pode executar?", "Compre 2 contratos...", "Zerar")
    const intent = parseVoiceTradeCommand(promptToSend, context);
    if (intent.type !== 'QUERY_INFO' && executeVoiceTradeCommand) {
      setIsSending(true);
      try {
        const res = await executeVoiceTradeCommand(intent);
        const axionMsg: CopilotChatMessage = {
          id: `cop_${Date.now()}`,
          sender: intent.type === 'INCOMPLETE_ORDER' ? 'system' : 'copilot',
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          text: res.message,
          signal: intent.side,
          action: intent.type === 'CLOSE_POSITION' ? 'CLOSE' : intent.type === 'BREAK_EVEN' ? 'BREAK_EVEN' : intent.type === 'MOVE_STOP' ? 'TRAIL_STOP' : intent.type === 'UPDATE_TAKE' ? 'TAKE_PROFIT' : intent.type === 'INCOMPLETE_ORDER' ? 'HOLD' : 'OPEN',
          targetPrice: intent.takeLevel ? intent.takeLevel.toString() : undefined,
          stopPrice: intent.stopLevel ? intent.stopLevel.toString() : undefined
        };
        setMessages(prev => [...prev, axionMsg]);
      } catch (err: any) {
        const errMsg: CopilotChatMessage = {
          id: `err_${Date.now()}`,
          sender: 'system',
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          text: `Falha ao processar comando: ${err?.message || err}`
        };
        setMessages(prev => [...prev, errMsg]);
      } finally {
        setIsSending(false);
      }
      return;
    }

    setIsSending(true);

    try {
      let res: any = null;
      if (askCopilotChatMessage) {
        res = await askCopilotChatMessage(promptToSend, messages.slice(-8));
      }

      if (res && res.success !== false) {
        const axionText = res.text || res.resposta || res.copilotThought || res.resumo || 'Análise de confluência concluída.';
        const cleanText = cleanMessageDisplay(axionText);
        
        let replySignal = res.signal || res.sinal;
        let replyAction = res.action || res.tradeAction;
        let targetP = res.targetPrice || (res.alvo && res.alvo !== '--' ? res.alvo : undefined);
        let stopP = res.stopPrice || (res.stop && res.stop !== '--' ? res.stop : undefined);

        // Se a IA confirmou ou estruturou uma execução na boleta institucional
        const isExecutionConfirmedInText = /(?:ORDEM|EXECU[ÇC][ÃA]O)\s+(?:EXECUTADA|CONFIRMADA|ENVIADA)|BOLETA\s+INSTITUCIONAL|ORDEM\s+DE\s+(?:COMPRA|VENDA)\s+(?:ENVIADA|EXECUTADA)|EXECUÇÃO CONFIRMADA/i.test(cleanText);
        if ((isExecutionConfirmedInText || replySignal === 'COMPRA' || replySignal === 'VENDA') && executeVoiceTradeCommand) {
          // Extrair lado
          const detectedSide: 'COMPRA' | 'VENDA' = replySignal === 'COMPRA' || /\b(COMPRA|COMPRAR|LONG)\b/i.test(cleanText) ? 'COMPRA' : 'VENDA';
          
          // Extrair contratos
          const qtyMatch = cleanText.match(/(?:Quantidade|Contratos?|Lotes?)\s*:\s*\**\s*(\d+)/i);
          const detectedContracts = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

          const refPriceNum = activePanel ? parseFloat(String(activePanel.price).replace(/[^\d.]/g, '')) : undefined;

          // Extrair Stop Loss
          let stopNum: number | undefined = undefined;
          let stopPts: number | undefined = undefined;
          if (stopP) {
            const parsed = parsePriceOrPoints(stopP, refPriceNum);
            if (parsed?.price) stopNum = parsed.price;
            else if (parsed?.points) stopPts = parsed.points;
          }
          if (!stopNum && !stopPts) {
            const stopM = cleanText.match(/Stop(?:\s*Loss)?(?:\s*\(.*?\))?\s*(?:em|de|:)?\s*\**\s*(\d{1,6}(?:[.,]\d+)?)\s*(?:pts|pontos)?\**/i);
            if (stopM) {
              const parsed = parsePriceOrPoints(stopM[1], refPriceNum);
              if (parsed?.price) stopNum = parsed.price;
              else if (parsed?.points) stopPts = parsed.points;
            }
          }

          // Extrair Take Profit
          let takeNum: number | undefined = undefined;
          let takePts: number | undefined = undefined;
          if (targetP) {
            const parsed = parsePriceOrPoints(targetP, refPriceNum);
            if (parsed?.price) takeNum = parsed.price;
            else if (parsed?.points) takePts = parsed.points;
          }
          if (!takeNum && !takePts) {
            const takeM = cleanText.match(/(?:Take(?:\s*Profit)?|Alvo)(?:\s*\(.*?\))?\s*(?:1|2)?\s*(?:em|de|:)?\s*\**\s*(\d{1,6}(?:[.,]\d+)?)\s*(?:pts|pontos)?\**/i);
            if (takeM) {
              const parsed = parsePriceOrPoints(takeM[1], refPriceNum);
              if (parsed?.price) takeNum = parsed.price;
              else if (parsed?.points) takePts = parsed.points;
            }
          }

          if (detectedSide && (stopNum || stopPts || takeNum || takePts || isExecutionConfirmedInText)) {
            executeVoiceTradeCommand({
              type: 'OPEN_POSITION',
              side: detectedSide,
              contracts: detectedContracts,
              stopLevel: stopNum,
              takeLevel: takeNum,
              stopPoints: stopPts,
              takePoints: takePts,
              rawText: promptToSend,
              confidenceScore: 0.95
            }).catch((e: any) => console.warn('[Auto Execute On Chat Reply Error]', e));
          }
        }

        const axionReply: CopilotChatMessage = {
          id: `cop_${Date.now()}`,
          sender: 'copilot',
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          text: cleanText,
          signal: replySignal,
          action: replyAction,
          targetPrice: targetP,
          stopPrice: stopP
        };
        setMessages(prev => [...prev, axionReply]);
      } else {
        const errMsg: CopilotChatMessage = {
          id: `err_${Date.now()}`,
          sender: 'system',
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          text: cleanMessageDisplay(res?.text || 'Não foi possível obter resposta do Axion. Verifique a API Key nas configurações.')
        };
        setMessages(prev => [...prev, errMsg]);
      }
    } catch (err: any) {
      const errMsg: CopilotChatMessage = {
        id: `err_${Date.now()}`,
        sender: 'system',
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        text: `Erro ao consultar Axion: ${err?.message || 'Falha de conexão'}`
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setIsSending(false);
    }
  };

  // Processamento inteligente de comando de voz (Execução Operacional vs Pergunta Analítica)
  const processVoiceCommand = async (transcript: string) => {
    if (!transcript.trim()) return;

    const userMsg: CopilotChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      text: `🎙️ ${transcript}`
    };
    setMessages(prev => [...prev, userMsg]);

    const panelData = activePanel || {};
    const candles = panelData.candles || [];
    const curPriceNum = Number(panelData.price || 0);

    const context = {
      currentPrice: curPriceNum,
      currentCandle: candles[candles.length - 1],
      priorCandle: candles[candles.length - 2],
      pointValueUsd: Number(settings?.point_value_usd || 2.0),
      levels: panelData.levels || panelData.gammaLevels || gammaLevels,
      volumeProfile: panelData.volumeProfile || volumeProfile,
      lastRecommendation: extractLastRecommendation(),
      chatHistory: messages.slice(-4)
    };

    const intent = parseVoiceTradeCommand(transcript, context);

    // Se for comando determinístico (Abrir, Mover Stop, Break-Even, Zerar, Incompleto)
    if (intent.type !== 'QUERY_INFO' && executeVoiceTradeCommand) {
      setIsSending(true);
      try {
        const res = await executeVoiceTradeCommand(intent);
        const axionMsg: CopilotChatMessage = {
          id: `cop_${Date.now()}`,
          sender: intent.type === 'INCOMPLETE_ORDER' ? 'system' : 'copilot',
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          text: res.message,
          signal: intent.side,
          action: intent.type === 'CLOSE_POSITION' ? 'CLOSE' : intent.type === 'BREAK_EVEN' ? 'BREAK_EVEN' : intent.type === 'MOVE_STOP' ? 'TRAIL_STOP' : intent.type === 'UPDATE_TAKE' ? 'TAKE_PROFIT' : intent.type === 'INCOMPLETE_ORDER' ? 'HOLD' : 'OPEN',
          targetPrice: intent.takeLevel ? intent.takeLevel.toString() : undefined,
          stopPrice: intent.stopLevel ? intent.stopLevel.toString() : undefined
        };
        setMessages(prev => [...prev, axionMsg]);
      } catch (err: any) {
        const errMsg: CopilotChatMessage = {
          id: `err_${Date.now()}`,
          sender: 'system',
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          text: `Falha ao processar comando de voz: ${err?.message || err}`
        };
        setMessages(prev => [...prev, errMsg]);
      } finally {
        setIsSending(false);
      }
      return;
    }

    // Se for pergunta analítica / diálogo técnico, envia para o Axion Copilot sem duplicar a mensagem no feed
    await handleSendMessage(transcript, true);
  };

  const handleToggleVoice = () => {
    if (isVoiceListening) {
      globalVoiceRecognition.stopListening();
      setIsVoiceListening(false);
      return;
    }

    setIsVoiceListening(true);
    globalVoiceRecognition.startListening({
      language: 'pt-BR',
      groqApiKey: settings?.groq_api_key || settings?.tts_groq_api_key,
      onStart: () => setIsVoiceListening(true),
      onResult: (transcript) => {
        setIsVoiceListening(false);
        if (transcript) {
          processVoiceCommand(transcript);
        }
      },
      onError: (err) => {
        setIsVoiceListening(false);
        const errMsg: CopilotChatMessage = {
          id: `err_${Date.now()}`,
          sender: 'system',
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          text: `🎙️ Voz: ${err}`
        };
        setMessages(prev => [...prev, errMsg]);
      },
      onEnd: () => setIsVoiceListening(false)
    });
  };

  const handleClearHistory = () => {
    const initial: CopilotChatMessage[] = [
      {
        id: `init_${Date.now()}`,
        sender: 'copilot',
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        text: 'Histórico limpo. Axion pronto para novas demandas.'
      }
    ];
    setMessages(initial);
    try {
      localStorage.setItem('vortex_copilot_boleta_history', JSON.stringify(initial));
    } catch {}
  };

  // Regra 5: Se o botão de ATIVAR IA estiver OFF, esconde o balão e o chat
  // Regra 6: Se o usuário estiver em outras telas (com exceção do Painel 1, Painel 2 / TradeStation e Replay), esconde o chat
  const isTradeView = currentPage === 'dashboard' || currentPage === 'replay' || !currentPage;
  if (!aiEnabled || !isTradeView) {
    return null;
  }

  const isBusy = isSending || isAnalyzing;
  const isLeftAligned = buttonPosition === 'left';

  return (
    <>
      {/* Botão Flutuante (Balão de Chat tipo WhatsApp / Assistente Axion IA) */}
      <div
        className={`fixed bottom-4 z-40 flex items-center transition-all duration-300 ${
          isLeftAligned ? 'left-4 md:left-20' : 'right-4'
        }`}
      >
        <button
          type="button"
          onClick={() => setIsOpen(prev => !prev)}
          className={`relative group p-3.5 rounded-full shadow-2xl transition-all duration-300 transform hover:scale-105 active:scale-95 cursor-pointer flex items-center justify-center border ${
            isOpen
              ? 'bg-purple-700 text-white border-purple-400 shadow-purple-900/60 ring-2 ring-purple-500/40'
              : isBusy
              ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white border-purple-400 shadow-purple-900/80 animate-pulse'
              : 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white border-emerald-400 shadow-emerald-950/60'
          }`}
          title="Axion IA Chat (Clique para abrir/fechar)"
        >
          {/* Ícone de Balão de Chat Moderno */}
          {isOpen ? (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <div className="relative flex items-center justify-center">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z" />
                <path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z" />
              </svg>
              {/* Badge de status operacional (Ativo / Analisando) */}
              <span
                className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-900 ${
                  isBusy
                    ? 'bg-amber-400 animate-ping'
                    : 'bg-emerald-400'
                }`}
              />
            </div>
          )}

          {/* Badge de Mensagens Não Lidas */}
          {!isOpen && unreadCount > 0 && (
            <span className="absolute -top-1 -left-1 bg-rose-500 text-white text-[10px] font-black rounded-full h-5 min-w-[20px] px-1 flex items-center justify-center border-2 border-slate-900 shadow-lg animate-bounce">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}

          {/* Tooltip Hover quando fechado */}
          {!isOpen && (
            <div
              className={`absolute ${
                isLeftAligned ? 'left-full ml-3' : 'right-full mr-3'
              } bg-slate-900/95 text-slate-200 border border-slate-700/80 px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 flex items-center gap-2`}
            >
              <span>🤖 Chat Axion IA</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-emerald-950 text-emerald-400 border border-emerald-800">
                ONLINE
              </span>
            </div>
          )}
        </button>
      </div>

      {/* Janela Flutuante do Chat Redimensionável (Ancorada ou Livre) */}
      {isOpen && (
        <div
          ref={cardContainerRef}
          style={{
            width: `${dimensions.width}px`,
            height: `${dimensions.height}px`,
            maxWidth: 'calc(100vw - 24px)',
            maxHeight: 'calc(100vh - 100px)',
            ...(isDocked
              ? (isLeftAligned
                  ? { bottom: '80px', left: '16px', right: 'auto', top: 'auto' }
                  : { bottom: '80px', right: '16px', left: 'auto', top: 'auto' })
              : { left: `${position.x}px`, top: `${position.y}px`, bottom: 'auto', right: 'auto' })
          }}
          className="fixed z-50 bg-[#0a0f1d]/95 backdrop-blur-md border border-slate-700/90 rounded-xl shadow-2xl flex flex-col overflow-hidden select-none transition-all duration-75 animate-in fade-in zoom-in-95"
        >
          {/* 1. ALÇA DE REDIMENSIONAMENTO NO CANTO SUPERIOR ESQUERDO (Top-Left) */}
          <div
            onMouseDown={(e) => handleResizeStart(e, 'top-left')}
            onTouchStart={(e) => handleResizeStart(e, 'top-left')}
            className="resize-handle absolute top-0 left-0 w-6 h-6 z-30 cursor-nwse-resize flex items-center justify-center group"
            title="Arraste para redimensionar (Superior Esquerdo)"
          >
            <div className="w-3 h-3 border-t-2 border-l-2 border-purple-400/80 group-hover:border-purple-300 group-hover:scale-110 transition-all" />
          </div>

          {/* 2. ALÇA DE REDIMENSIONAMENTO NO CANTO INFERIOR DIREITO (Bottom-Right) */}
          <div
            onMouseDown={(e) => handleResizeStart(e, 'bottom-right')}
            onTouchStart={(e) => handleResizeStart(e, 'bottom-right')}
            className="resize-handle absolute bottom-0 right-0 w-6 h-6 z-30 cursor-nwse-resize flex items-center justify-center group"
            title="Arraste para redimensionar (Inferior Direito)"
          >
            <div className="w-3 h-3 border-b-2 border-r-2 border-purple-400/80 group-hover:border-purple-300 group-hover:scale-110 transition-all" />
          </div>

          {/* Borda Superior Arrastável (Altura) */}
          <div
            onMouseDown={(e) => handleResizeStart(e, 'top')}
            onTouchStart={(e) => handleResizeStart(e, 'top')}
            className="resize-handle absolute top-0 left-6 right-28 h-2 z-20 cursor-ns-resize hover:bg-purple-500/30 transition-colors"
            title="Arraste para ajustar altura"
          />

          {/* Borda Inferior Arrastável (Altura) */}
          <div
            onMouseDown={(e) => handleResizeStart(e, 'bottom')}
            onTouchStart={(e) => handleResizeStart(e, 'bottom')}
            className="resize-handle absolute bottom-0 left-6 right-6 h-2 z-20 cursor-ns-resize hover:bg-purple-500/30 transition-colors"
            title="Arraste para ajustar altura"
          />

          {/* Borda Esquerda Arrastável (Largura) */}
          <div
            onMouseDown={(e) => handleResizeStart(e, 'left')}
            onTouchStart={(e) => handleResizeStart(e, 'left')}
            className="resize-handle absolute top-6 left-0 bottom-6 w-2 z-20 cursor-ew-resize hover:bg-purple-500/30 transition-colors"
            title="Arraste para ajustar largura"
          />

          {/* Borda Direita Arrastável (Largura) */}
          <div
            onMouseDown={(e) => handleResizeStart(e, 'right')}
            onTouchStart={(e) => handleResizeStart(e, 'right')}
            className="resize-handle absolute top-6 right-0 bottom-6 w-2 z-20 cursor-ew-resize hover:bg-purple-500/30 transition-colors"
            title="Arraste para ajustar largura"
          />

          {/* Header do Chat com Suporte a Drag & Drop */}
          <div
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
            className={`bg-gradient-to-r from-slate-900 via-[#0e1629] to-slate-900 px-3 py-2.5 border-b border-slate-800 flex items-center justify-between select-none shrink-0 shadow-sm pl-5 ${
              isDocked ? 'cursor-grab active:cursor-grabbing' : 'cursor-move active:cursor-grabbing'
            }`}
            title="Clique e arraste para mover o card para qualquer lugar da tela"
          >
            <div className="flex items-center gap-2 min-w-0 pointer-events-none">
              <div className="w-7 h-7 rounded-lg bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-sm shadow-inner shrink-0">
                🤖
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className={`${scale.headerTitle} text-slate-100 uppercase tracking-wider`}>
                    AXION IA
                  </span>
                </div>
                {isBusy && (
                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    <span className={`${scale.headerSub} font-semibold text-amber-300`}>
                      Analisando...
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Ações do Header */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Botão de Atalho para as Configurações da IA */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCopilotModalOpen && setIsCopilotModalOpen(true);
                }}
                className="p-1.5 bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 hover:text-white border border-purple-800/80 rounded-md text-xs font-bold flex items-center justify-center transition active:scale-95 cursor-pointer shadow-sm"
                title="Abrir Configurações do Axion IA (Rotas, Prompts, Contas, Posição)"
              >
                <span>⚙️</span>
              </button>

              {/* Botão de Mute / Voz (Áudio TTS & Voz) */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const currentTtsEnabled = settings?.enable_tts ?? true;
                  const nextTtsEnabled = !currentTtsEnabled;
                  if (saveSettings) {
                    saveSettings({
                      enable_tts: nextTtsEnabled,
                      resource_tts_enabled: nextTtsEnabled
                    });
                  }
                  if (!nextTtsEnabled && typeof window !== 'undefined' && window.speechSynthesis) {
                    window.speechSynthesis.cancel();
                  }
                }}
                className={`p-1.5 rounded-md text-xs font-bold flex items-center justify-center transition active:scale-95 cursor-pointer shadow-sm border ${
                  (settings?.enable_tts ?? true)
                    ? 'bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 hover:text-white border-emerald-800/80 shadow-[0_0_8px_rgba(52,211,153,0.2)]'
                    : 'bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 hover:text-white border-rose-800/80'
                }`}
                title={
                  (settings?.enable_tts ?? true)
                    ? 'Áudio da IA Ativado (🔊). Clique para colocar em Mudo (Apenas texto sem som)'
                    : 'Áudio da IA no Mudo (🔇). Clique para reativar voz e alertas sonoros'
                }
              >
                <span>{(settings?.enable_tts ?? true) ? '🔊' : '🔇'}</span>
              </button>

              {/* Botão Limpar Histórico */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClearHistory();
                }}
                className="p-1.5 text-slate-400 hover:text-slate-200 rounded-md hover:bg-slate-800/80 transition active:scale-95 cursor-pointer"
                title="Limpar histórico do chat"
              >
                🗑️
              </button>

              {/* Botão de Mover Livremente / Reancorar junto ao Balão (À direita da lixeira) */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleDockMode();
                }}
                className={`p-1.5 rounded-md transition active:scale-95 cursor-pointer flex items-center justify-center ${
                  isDocked
                    ? 'text-slate-400 hover:text-purple-300 hover:bg-purple-950/40 border border-transparent hover:border-purple-800/60'
                    : 'text-emerald-400 bg-emerald-950/50 border border-emerald-500/50 shadow-[0_0_8px_rgba(52,211,153,0.3)] animate-pulse'
                }`}
                title={
                  isDocked
                    ? 'Destacar e mover livremente pela tela'
                    : 'Reancorar junto ao balão do chat'
                }
              >
                {isDocked ? (
                  // Ícone de Desancorar / Destacar para mover
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                ) : (
                  // Ícone de Reancorar / Voltar para a posição do balão
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 13l-7 7-7-7m14-8l-7 7-7-7" />
                  </svg>
                )}
              </button>

              {/* Botão Fechar / Minimizar */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                }}
                className="p-1.5 text-slate-400 hover:text-rose-400 rounded-md hover:bg-slate-800/80 transition active:scale-95 cursor-pointer font-bold text-xs"
                title="Minimizar chat"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Chips Rápidos de Demanda Técnica (Grid Responsivo que não corta botões) */}
          <div className="px-2.5 py-1.5 bg-[#070c18] border-b border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-1.5 shrink-0 select-none">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => handleSendMessage('Faça uma análise de Price Action imediato, agressão do tape e gatilho de momento do ativo agora.')}
              className={`w-full justify-center text-center bg-blue-950/80 hover:bg-blue-900 text-blue-300 border border-blue-700/60 rounded ${scale.chipText} font-extrabold uppercase tracking-wider transition active:scale-95 disabled:opacity-50 flex items-center gap-1 cursor-pointer truncate`}
              title="Análise de Price Action e Gatilho Imediato"
            >
              <span>⚡</span>
              <span className="truncate">Analisar Agora</span>
            </button>

            <button
              type="button"
              disabled={isBusy}
              onClick={() => handleSendMessage('Qual o panorama macro 360°, correlações de Nasdaq/S&P com VIX e DXY, ações M7 e níveis Gamma?')}
              className={`w-full justify-center text-center bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-700/60 rounded ${scale.chipText} font-extrabold uppercase tracking-wider transition active:scale-95 disabled:opacity-50 flex items-center gap-1 cursor-pointer truncate`}
              title="Panorama Macro e Correlações Estruturais"
            >
              <span>🔍</span>
              <span className="truncate">Visão 360°</span>
            </button>

            <button
              type="button"
              disabled={isBusy}
              onClick={() => handleSendMessage('Avalie minha posição e risco atual com base nas confluências de fluxo, stops e volatilidade.')}
              className={`w-full justify-center text-center bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60 rounded ${scale.chipText} font-extrabold uppercase tracking-wider transition active:scale-95 disabled:opacity-50 flex items-center gap-1 cursor-pointer truncate`}
              title="Gestão de Posição e Risco Operacional"
            >
              <span>🛡️</span>
              <span className="truncate">Posição & Risco</span>
            </button>

            <button
              type="button"
              disabled={isBusy}
              onClick={() => handleSendMessage('Quais são os principais pontos de suporte, resistência, HVL e alvos gamma para o ativo hoje?')}
              className={`w-full justify-center text-center bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded ${scale.chipText} font-extrabold uppercase tracking-wider transition active:scale-95 disabled:opacity-50 flex items-center gap-1 cursor-pointer truncate`}
              title="Níveis Gamma e Alvos de Preço"
            >
              <span>🎯</span>
              <span className="truncate">Níveis & Alvos</span>
            </button>
          </div>

          {/* Feed de Mensagens & Pensamentos do Axion */}
          <div className={`flex-1 p-3 ${scale.containerGap} overflow-y-auto font-mono bg-[#060a14]/60 select-text`}>
            {messages.map((m) => {
              const isCopilot = m.sender === 'copilot';
              const isUser = m.sender === 'user';

              return (
                <div
                  key={m.id}
                  className={`${scale.msgPadding} rounded-lg border transition ${
                    isUser
                      ? 'bg-blue-950/50 border-blue-800/70 text-blue-100 ml-6 shadow'
                      : m.sender === 'system'
                      ? 'bg-amber-950/40 border-amber-800/60 text-amber-200'
                      : 'bg-[#0d1527] border-slate-800/90 text-slate-200 mr-4 shadow-sm'
                  }`}
                >
                  {/* Header da Mensagem */}
                  <div className={`flex items-center justify-between ${scale.authorText} text-slate-400 font-sans mb-1.5`}>
                    <span className="font-bold flex items-center gap-1">
                      {isCopilot ? (
                        <span className="text-cyan-400 flex items-center gap-1">
                          <span>✨</span> Axion
                        </span>
                      ) : isUser ? (
                        <span className="text-blue-300 flex items-center gap-1">
                          <span>👤</span> Você
                        </span>
                      ) : (
                        <span className="text-amber-400 flex items-center gap-1">
                          <span>⚙️</span> Sistema
                        </span>
                      )}
                    </span>
                    <span className="font-mono">{m.timestamp}</span>
                  </div>

                  {/* Badges de Sinal / Alvos / Stop / Ação */}
                  {isCopilot && (m.signal || m.targetPrice || m.stopPrice || m.action) && (
                    <div className={`flex flex-wrap items-center gap-1 mb-1.5 font-sans ${scale.badgeText}`}>
                      {m.signal && (
                        <span
                          className={`px-1.5 py-0.5 rounded font-black uppercase ${
                            m.signal === 'COMPRA'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : m.signal === 'VENDA'
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                              : m.signal === 'SAIR'
                              ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          }`}
                        >
                          {m.signal}
                        </span>
                      )}
                      {m.targetPrice && (
                        <span className="bg-emerald-950/60 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-800/60 font-bold">
                          Alvo: {m.targetPrice}
                        </span>
                      )}
                      {m.stopPrice && (
                        <span className="bg-rose-950/60 text-rose-300 px-1.5 py-0.5 rounded border border-rose-800/60 font-bold">
                          Stop: {m.stopPrice}
                        </span>
                      )}
                      {m.action && (
                        <span className="bg-blue-950/60 text-blue-300 px-1.5 py-0.5 rounded border border-blue-800/60 font-bold">
                          {m.action}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Texto da Mensagem */}
                  <div className={`leading-relaxed whitespace-pre-wrap font-sans ${scale.msgText} text-slate-200`}>
                    {cleanMessageDisplay(m.text)}
                  </div>

                  {/* Thought detalhado (se houver e não for redundante) */}
                  {m.thought && cleanMessageDisplay(m.thought) && cleanMessageDisplay(m.thought) !== cleanMessageDisplay(m.text) && (
                    <div className={`mt-2 pt-1.5 border-t border-slate-800/60 ${scale.thoughtText} text-slate-400 italic`}>
                      💡 {cleanMessageDisplay(m.thought)}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Indicador de Carregamento / IA Pensando */}
            {isBusy && (
              <div className="p-2.5 rounded-lg bg-purple-950/30 border border-purple-800/50 text-purple-300 text-xs flex items-center gap-2 animate-pulse">
                <span className="text-sm">⚡</span>
                <span>Axion analisando confluências e processando demanda...</span>
              </div>
            )}

            <div ref={feedEndRef} />
          </div>

          {/* Input de Mensagem e Controle de Voz pt-BR */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="bg-[#090e1a] p-2.5 border-t border-slate-800 flex items-center gap-1.5 shrink-0 select-text"
          >
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={isVoiceListening ? '🎙️ Ouvindo em Português BR... Fale seu comando!' : 'Pergunte ao Axion ou envie um comando...'}
              disabled={isBusy || isVoiceListening}
              className={`flex-1 bg-[#050811] border ${
                isVoiceListening ? 'border-rose-500 ring-2 ring-rose-500/40 text-rose-300' : 'border-slate-700/90 text-slate-100'
              } rounded-lg ${scale.inputText} placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 disabled:opacity-80 transition`}
            />

            {/* Botão de Controle de Voz Multiplataforma (pt-BR) */}
            <button
              type="button"
              onClick={handleToggleVoice}
              disabled={isBusy}
              className={`p-2 rounded-lg font-bold transition-all cursor-pointer flex items-center justify-center border shadow-md active:scale-95 ${
                isVoiceListening
                  ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-400 animate-pulse shadow-rose-900/60 ring-2 ring-rose-500/50'
                  : 'bg-slate-900 hover:bg-purple-950/60 text-purple-400 hover:text-purple-300 border-purple-800/60 shadow-slate-950'
              }`}
              title={isVoiceListening ? 'Clique para parar a escuta' : 'Comando por Voz em Português BR (Clique para Falar)'}
            >
              <span className="text-sm">{isVoiceListening ? '⏹️' : '🎙️'}</span>
            </button>

            {/* Botão Enviar Texto */}
            <button
              type="submit"
              disabled={isBusy || !inputValue.trim()}
              className={`bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 active:scale-95 text-white font-bold ${scale.inputBtn} rounded-lg transition cursor-pointer flex items-center justify-center shadow-md shadow-purple-900/30`}
              title="Enviar mensagem para o Axion"
            >
              ➤
            </button>
          </form>
        </div>
      )}
    </>
  );
};
