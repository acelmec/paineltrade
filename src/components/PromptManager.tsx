import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import type { AIPrompt, CustomStrategy } from '../services/db';
import { callGeneralChatAPI } from '../services/ai';
import type { ChatMessage } from '../services/ai';

export const PromptManager: React.FC = () => {
  const {
    settings,
    saveSettings,
    prompts,
    isLoadingPrompts,
    savePromptAction,
    deletePromptAction,
    user,
    addLog,
    activePanel,
    customStrategies,
    publicStrategies
  } = useApp();

  const allAvailableStrategies = useMemo<CustomStrategy[]>(() => {
    const list: CustomStrategy[] = [];
    const seen = new Set<string>();

    (customStrategies || []).forEach((s: CustomStrategy) => {
      if (s.id && !seen.has(s.id)) {
        seen.add(s.id);
        list.push(s);
      }
    });

    (publicStrategies || []).forEach(s => {
      if (s.id && !seen.has(s.id)) {
        seen.add(s.id);
        list.push(s);
      }
    });

    return list;
  }, [customStrategies, publicStrategies]);

  // Estados do Formulário
  const [selectedPrompt, setSelectedPrompt] = useState<AIPrompt | null>(null);
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [confluences, setConfluences] = useState<string>('');
  const [triggerEntry, setTriggerEntry] = useState<string>('');
  const [stopLossType, setStopLossType] = useState<'points' | 'regions'>('points');
  const [stopLossValue, setStopLossValue] = useState<string>('');
  const [takeProfitType, setTakeProfitType] = useState<'points' | 'regions'>('points');
  const [takeProfitValue, setTakeProfitValue] = useState<string>('');
  const [isAdminCheckbox, setIsAdminCheckbox] = useState<boolean>(false);
  const [analyzeChart, setAnalyzeChart] = useState<boolean>(true);
  const [triggerStrategyId, setTriggerStrategyId] = useState<string>('');
  const [promptType, setPromptType] = useState<'context_filter' | 'signal_generator'>('context_filter');
  const [isSaving, setIsSaving] = useState<boolean>(false);


  // Estados do Chat Construtor
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    {
      role: 'assistant',
      content: 'Olá! Sou o Assistente Construtor de Estratégias do Axion TradeStation. 🧠\n\nPosso te ajudar a formular confluências (usando Z-Score, Sentimento, Delta, Força Momentum e níveis Gamma) e definir gatilhos de entrada com Stop Loss/Take Profit.\n\nQue tipo de estratégia você gostaria de criar hoje? Descreva sua ideia ou peça sugestões!'
    }
  ]);
  const [chatInput, setChatInput] = useState<string>('');
  const [isChatSending, setIsChatSending] = useState<boolean>(false);
  const [chatError, setChatError] = useState<string | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Rolagem automática do chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isChatSending]);

  // Sem necessidade de sincronizar panelIdState

  // Carrega os dados da estratégia selecionada no formulário
  const handleSelectPrompt = (prompt: AIPrompt) => {
    setSelectedPrompt(prompt);
    setName(prompt.name);
    // Vinculado dinamicamente
    setDescription(prompt.description || '');
    setConfluences(prompt.confluences);
    setTriggerEntry(prompt.trigger_entry);
    setStopLossType(prompt.stop_loss_type);
    setStopLossValue(prompt.stop_loss_value);
    setTakeProfitType(prompt.take_profit_type);
    setTakeProfitValue(prompt.take_profit_value);
    setIsAdminCheckbox(prompt.is_admin);
    setAnalyzeChart(prompt.analyze_chart !== false);
    setTriggerStrategyId(prompt.trigger_strategy_id || '');
    setPromptType(prompt.prompt_type || 'context_filter');

    // Atualiza a conversa do chatbot com foco na estratégia selecionada
    setChatMessages([
      {
        role: 'assistant',
        content: `Olá! Notei que você carregou a estratégia **"${prompt.name}"** para edição. 🧠\n\nPosso te ajudar a refinar suas confluências, ajustar os gatilhos ou recalibrar os limites de Stop Loss e Take Profit. Como você gostaria de otimizar ou modificar essa estratégia hoje?`
      }
    ]);
  };

  const handleClearForm = () => {
    setSelectedPrompt(null);
    setName('');
    // Limpo dinamicamente
    setDescription('');
    setConfluences('');
    setTriggerEntry('');
    setStopLossType('points');
    setStopLossValue('');
    setTakeProfitType('points');
    setTakeProfitValue('');
    setIsAdminCheckbox(false);
    setAnalyzeChart(true);
    setTriggerStrategyId('');
    setPromptType('context_filter');

    // Reseta o chatbot para a mensagem inicial padrão
    setChatMessages([
      {
        role: 'assistant',
        content: 'Olá! Sou o Assistente Construtor de Estratégias do Axion TradeStation. 🧠\n\nPosso te ajudar a formular confluências (usando Z-Score, Sentimento, Delta, Força Momentum e níveis Gamma) e definir gatilhos de entrada com Stop Loss/Take Profit.\n\nQue tipo de estratégia você gostaria de criar hoje? Descreva sua ideia ou peça sugestões!'
      }
    ]);
  };

  // Salvar formulário
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (promptType === 'signal_generator' && !triggerStrategyId) {
      alert('⚠️ Para salvar uma estratégia como "Gerador de Sinais (Conector)", é OBRIGATÓRIO selecionar um Algoritmo de Robô Acionador.');
      return;
    }

    setIsSaving(true);
    const payload: Partial<AIPrompt> = {
      id: selectedPrompt?.id,
      name,
      panel_id: activePanel?.id || null,
      description,
      confluences,
      trigger_entry: triggerEntry,
      stop_loss_type: stopLossType,
      stop_loss_value: stopLossValue,
      take_profit_type: takeProfitType,
      take_profit_value: takeProfitValue,
      is_admin: user?.email === 'admin@vortex.com' ? isAdminCheckbox : false,
      analyze_chart: analyzeChart,
      trigger_strategy_id: triggerStrategyId || null,
      prompt_type: promptType
    };

    // Permitir múltiplos prompts por estratégia de robô sem limpar conflitos

    const result = await savePromptAction(payload);
    setIsSaving(false);
    if (result.success) {
      alert(`Estratégia "${name}" salva com sucesso!`);
      handleClearForm();
    } else {
      alert(`Erro ao salvar estratégia: ${result.error || 'Erro desconhecido'}`);
    }
  };


  // Excluir estratégia
  const handleDelete = async () => {
    if (!selectedPrompt) return;
    if (window.confirm(`Tem certeza de que deseja excluir a estratégia "${selectedPrompt.name}"?`)) {
      const success = await deletePromptAction(selectedPrompt.id);
      if (success) {
        handleClearForm();
      }
    }
  };

  // Ativar estratégia no painel
  const handleToggleActivate = async (promptId: string) => {
    if (!settings) return;
    const activePromptIds = settings.selected_prompt_id ? settings.selected_prompt_id.split(',').filter(Boolean) : [];
    let nextActiveIds: string[];
    if (activePromptIds.includes(promptId)) {
      nextActiveIds = activePromptIds.filter((id: string) => id !== promptId);
    } else {
      nextActiveIds = [...activePromptIds, promptId];
    }
    const nextActiveIdStr = nextActiveIds.join(',');
    
    const success = await saveSettings({ selected_prompt_id: nextActiveIdStr || null });
    if (success) {
      if (nextActiveIds.includes(promptId)) {
        const activeName = prompts.find(p => p.id === promptId)?.name || 'Estratégia';
        addLog('SISTEMA', `Estratégia '${activeName}' ativada na IA do Painel.`, 'sistema');
      } else {
        const inactiveName = prompts.find(p => p.id === promptId)?.name || 'Estratégia';
        addLog('SISTEMA', `Estratégia '${inactiveName}' desativada na IA do Painel.`, 'sistema');
      }
    }
  };

  // Exportar para JSON
  const handleExport = (prompt: AIPrompt) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(prompt, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `vortex_strategy_${prompt.name.toLowerCase().replace(/\s+/g, '_')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Importar JSON
  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!parsed.name) {
          alert('Arquivo JSON inválido. A propriedade "name" é obrigatória.');
          return;
        }

        setSelectedPrompt(null);
        setName(parsed.name || '');
        setDescription(parsed.description || '');
        setConfluences(parsed.confluences || '');
        setTriggerEntry(parsed.trigger_entry || '');
        setStopLossType(parsed.stop_loss_type === 'regions' ? 'regions' : 'points');
        setStopLossValue(parsed.stop_loss_value || '');
        setTakeProfitType(parsed.take_profit_type === 'regions' ? 'regions' : 'points');
        setTakeProfitValue(parsed.take_profit_value || '');
        setIsAdminCheckbox(false);
        setAnalyzeChart(parsed.analyze_chart !== false);
        setTriggerStrategyId(parsed.trigger_strategy_id || '');
        alert(`Estratégia "${parsed.name}" carregada no formulário. Clique em Salvar para registrá-la.`);
      } catch (err) {
        alert('Erro ao processar o arquivo JSON. Certifique-se de que o arquivo está no formato correto.');
      }
    };
    reader.readAsText(file);
    if (e.target) e.target.value = ''; // Reset input
  };

  // Enviar mensagem no chat builder
  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatSending) return;

    if (!settings) {
      setChatError('Configurações do sistema ausentes.');
      return;
    }

    const apiKey = 
      settings.ai_provider === 'groq' ? settings.groq_api_key :
      settings.ai_provider === 'gemini' ? settings.gemini_api_key :
      settings.openai_api_key;

    if (!apiKey) {
      setChatError(`Configure uma API Key para o provedor ${settings.ai_provider.toUpperCase()} nas Configurações.`);
      return;
    }

    setChatError(null);
    const userMsg = chatInput.trim();
    setChatInput('');
    
    // Adiciona msg do usuário
    const newHistory = [...chatMessages, { role: 'user' as const, content: userMsg }];
    setChatMessages(newHistory);
    setIsChatSending(true);

    try {
      const currentStrategyText = name.trim() ? `
ATENÇÃO: O usuário está atualmente com a seguinte estratégia carregada no formulário de edição do painel:
- Nome: "${name}"
- Descrição: "${description || 'Nenhuma descrição'}"
- Confluências Exigidas: "${confluences || 'Vazio'}"
- Gatilho de Entrada: "${triggerEntry || 'Vazio'}"
- Stop Loss: Tipo "${stopLossType === 'regions' ? 'Níveis Gamma' : 'Pontos/Ticks'}" com valor "${stopLossValue || 'Vazio'}"
- Take Profit: Tipo "${takeProfitType === 'regions' ? 'Níveis Gamma' : 'Pontos/Ticks'}" com valor "${takeProfitValue || 'Vazio'}"

Se o usuário pedir para editar, modificar, complementar ou ajudar a alterar essa estratégia, use essas informações de contexto atuais. Ao formular sugestões, inclua o novo bloco JSON completo com as alterações para que ele possa clicar no botão "Aplicar no Formulário".
` : `
ATENÇÃO: No momento, o formulário de edição de estratégia está VAZIO. Ajude o usuário a criar uma estratégia nova do zero.
`;

      const systemPromptContent = `Você é o Assistente Construtor de Estratégias do Axion TradeStation. 
Seu objetivo é ajudar o usuário a criar e estruturar um Prompt de Estratégia de Trading altamente eficaz.
Você conhece os dados que o sistema fornece para a IA:
- Preço de Mercado em Tempo Real.
- Indicador Z-Score e ATR Ratio (volatilidade e aceleração de preço).
- Velocímetro de Sentimento (agressão de compra vs venda em percentual %).
- Força de Momentum (força agregada de S&P 500, Nasdaq, VIX, DXY e ações).
- Delta e Delta Ratio (acumulado do dia e janelas de 1m, 5m, 15m).
- Níveis Gamma de Suporte/Resistência (HVL, Call, Put, GWall, Máxima/Mínima de 1D).

${currentStrategyText}

Oriente o usuário fazendo perguntas ou dando sugestões técnicas. Quando definirem confluências (ex: Z-score > 1.5 e sentimento comprador > 65%), gatilho de entrada específico e Stop Loss/Take Profit (podem ser em pontos como "100 pontos" ou baseados em níveis como "Abaixo do suporte Put"), você DEVE gerar um código JSON contendo a estrutura da estratégia para que a UI ofereça um botão de importação automática.

O bloco JSON deve seguir EXATAMENTE esta estrutura de chaves:
\`\`\`json
{
  "name": "Nome da Estratégia",
  "description": "Breve descrição",
  "confluences": "Instruções das confluências detalhadas",
  "trigger_entry": "Gatilho de entrada específico",
  "stop_loss_type": "points" | "regions",
  "stop_loss_value": "Valor ou descrição do stop loss",
  "take_profit_type": "points" | "regions",
  "take_profit_value": "Valor ou descrição do take profit",
  "analyze_chart": true | false
}
\`\`\`
Não use aspas internas extras nas propriedades. Se a estratégia estiver pronta, apresente o JSON e diga que o usuário pode importá-la clicando no botão "Aplicar no Formulário" abaixo.`;

      // Monta histórico de mensagens para a API
      const messagesPayload: ChatMessage[] = [
        { role: 'system', content: systemPromptContent },
        ...newHistory.map(m => ({
          role: m.role,
          content: m.content
        }))
      ];

      const model = 
        settings.ai_provider === 'groq' ? settings.groq_model :
        settings.ai_provider === 'gemini' ? settings.gemini_model :
        settings.openai_model;

      const aiResponse = await callGeneralChatAPI(
        settings.ai_provider,
        apiKey,
        model,
        messagesPayload
      );

      setChatMessages(prev => [...prev, { role: 'assistant', content: aiResponse }]);
    } catch (err: any) {
      console.error(err);
      setChatError(err.message || 'Erro de rede na API da IA.');
    } finally {
      setIsChatSending(false);
    }
  };

  // Função auxiliar para verificar e extrair blocos JSON de estratégias das mensagens da IA
  const extractStrategyJSON = (text: string) => {
    try {
      const match = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
      const rawText = match ? match[1] : text;
      
      const startIdx = rawText.indexOf('{');
      const endIdx = rawText.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1) {
        const jsonStr = rawText.slice(startIdx, endIdx + 1);
        
        // Limpa comentários e vírgulas pendentes para evitar falhas no JSON.parse
        let cleaned = jsonStr
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/(?:^|[^:])\/\/.*$/gm, '')
          .replace(/,\s*([}\]])/g, '$1');

        try {
          const parsed = JSON.parse(cleaned);
          const hasStrategyField = parsed && (
            parsed.name || 
            parsed.description || 
            parsed.confluences || 
            parsed.trigger_entry || 
            parsed.stop_loss_type || 
            parsed.stop_loss_value || 
            parsed.take_profit_type || 
            parsed.take_profit_value
          );
          if (hasStrategyField) {
            return parsed;
          }
        } catch (e) {
          // Fallback robusto usando regex caso o parse falhe
          const nameMatch = cleaned.match(/"name"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
          const descMatch = cleaned.match(/"description"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
          const confMatch = cleaned.match(/"confluences"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
          const trigMatch = cleaned.match(/"trigger_entry"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
          const slTypeMatch = cleaned.match(/"stop_loss_type"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
          const slValMatch = cleaned.match(/"stop_loss_value"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
          const tpTypeMatch = cleaned.match(/"take_profit_type"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
          const tpValMatch = cleaned.match(/"take_profit_value"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);

          if (nameMatch || confMatch || trigMatch) {
            const unescapeStr = (str: string | undefined) => {
              if (!str) return '';
              return str.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
            };
            const optAnalyzeChartMatch = cleaned.match(/"analyze_chart"\s*:\s*(true|false)/);
            return {
              name: unescapeStr(nameMatch?.[1]),
              description: unescapeStr(descMatch?.[1]),
              confluences: unescapeStr(confMatch?.[1]),
              trigger_entry: unescapeStr(trigMatch?.[1]),
              stop_loss_type: slTypeMatch?.[1] === 'regions' ? 'regions' : 'points',
              stop_loss_value: unescapeStr(slValMatch?.[1]),
              take_profit_type: tpTypeMatch?.[1] === 'regions' ? 'regions' : 'points',
              take_profit_value: unescapeStr(tpValMatch?.[1]),
              analyze_chart: optAnalyzeChartMatch ? optAnalyzeChartMatch[1] === 'true' : true
            };
          }
        }
      }
    } catch (e) {
      // Ignora erro se não for JSON válido
    }
    return null;
  };

  const handleApplyStrategyFromChat = (strategy: any) => {
    // Mantemos a estratégia selecionada no editor para atualizar o registro existente e mesclamos apenas os campos fornecidos pelo JSON
    if (strategy.name !== undefined) setName(strategy.name || '');
    if (strategy.description !== undefined) setDescription(strategy.description || '');
    if (strategy.confluences !== undefined) setConfluences(strategy.confluences || '');
    if (strategy.trigger_entry !== undefined) setTriggerEntry(strategy.trigger_entry || '');
    if (strategy.stop_loss_type !== undefined) setStopLossType(strategy.stop_loss_type === 'regions' ? 'regions' : 'points');
    if (strategy.stop_loss_value !== undefined) setStopLossValue(strategy.stop_loss_value || '');
    if (strategy.take_profit_type !== undefined) setTakeProfitType(strategy.take_profit_type === 'regions' ? 'regions' : 'points');
    if (strategy.take_profit_value !== undefined) setTakeProfitValue(strategy.take_profit_value || '');
    if (strategy.analyze_chart !== undefined) setAnalyzeChart(!!strategy.analyze_chart);
    
    if (selectedPrompt) {
      setIsAdminCheckbox(selectedPrompt.is_admin);
    } else {
      setSelectedPrompt(null);
      setIsAdminCheckbox(false);
    }
    
    addLog('SISTEMA', `Estratégia "${strategy.name || selectedPrompt?.name || 'Editada'}" importada do chat. Revise e salve no formulário.`, 'sistema');
  };

  const activePromptIds = settings?.selected_prompt_id ? settings.selected_prompt_id.split(',').filter(Boolean) : [];

  const filteredPrompts = prompts.filter(p => 
    p.is_admin || 
    !p.panel_id || 
    p.panel_id === 'all' || 
    p.panel_id === activePanel?.id || 
    p.panel_id === activePanel?.instance_id || 
    (user?.id && p.user_id === user.id) ||
    p.user_id === 'local_user' ||
    user?.email === 'admin@vortex.com'
  );


  const renderPromptCard = (p: AIPrompt) => {
    const isActive = activePromptIds.includes(p.id);
    const isSelected = selectedPrompt?.id === p.id;

    return (
      <div
        key={p.id}
        onClick={() => handleSelectPrompt(p)}
        className={`p-1.5 rounded border cursor-pointer select-none transition flex flex-col justify-between ${
          isSelected 
            ? 'bg-blue-950/30 border-blue-500' 
            : isActive
              ? 'bg-slate-900/60 border-slate-700'
              : 'bg-slate-950 border-slate-900 hover:bg-slate-900/50'
        }`}
      >
        <div className="flex justify-between items-start gap-1">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <span className="text-[10px] font-extrabold text-slate-200 font-mono truncate" title={p.name}>
              {p.name}
            </span>
            {p.prompt_type === 'signal_generator' ? (
              <span className="text-[7px] font-extrabold px-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0" title="Gerador Autônomo de Sinais">
                ⚡ Sinal
              </span>
            ) : (
              <span className="text-[7px] font-extrabold px-1 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shrink-0" title="Filtro de Contexto para Robôs">
                🛡️ Contexto
              </span>
            )}
          </div>
          {p.is_admin && (
            <span className="text-[7px] font-bold px-1 py-0.2 rounded border bg-purple-500/10 text-purple-400 border-purple-800/30 shrink-0">
              Sistema
            </span>
          )}
        </div>
        
        <p className="text-[8px] text-slate-500 mt-0.5 truncate leading-tight">
          {p.description || 'Sem descrição.'}
        </p>

        <div className="flex justify-between items-center mt-1.5">
          <div className="flex items-center gap-1 text-[8.5px] text-slate-400 bg-slate-900/40 px-1 py-0.5 rounded border border-slate-800/60 select-text" onClick={(e) => e.stopPropagation()}>
            <span className="font-mono text-slate-500 text-[8px]">ID:</span>
            <span className="font-mono font-medium truncate max-w-[45px]" title={p.id}>{p.id}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(p.id);
                alert('ID da Estratégia copiado!');
              }}
              className="text-[9px] text-blue-400 hover:text-blue-300 font-sans cursor-pointer ml-0.5"
            >
              📋
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleToggleActivate(p.id); }}
              className={`text-[8px] font-extrabold px-1.5 py-0.2 rounded transition ${
                isActive
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              {isActive ? '🟢 Ativa' : 'Ativar'}
            </button>
            
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleExport(p); }}
              className="text-[9px] text-slate-500 hover:text-slate-300 transition"
              title="Exportar estratégia para o PC"
            >
              📥
            </button>
          </div>
        </div>
      </div>
    );
  };


  return (
    <div className="space-y-4">
      {/* Hidden input for import JSON */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleImportFileChange} 
        accept=".json" 
        className="hidden" 
      />

      <div className="flex flex-col lg:flex-row justify-between items-start gap-4">
        <div className="w-full">
          <h2 className="text-xl font-black text-white tracking-wider flex items-center flex-wrap gap-2">
            <span>📝</span> Prompts e Estratégias IA
            <span className="text-xs font-normal text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded border border-slate-700 font-sans ml-0 lg:ml-2">
              Configurando Ativo: <strong className="text-blue-400 font-extrabold">{activePanel?.name || 'NASDAQ'}</strong>
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Personalize as estratégias enviadas à inteligência artificial do sistema. Você pode criar novas confluências ou usar o chat interativo para estruturá-las.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        
        {/* Coluna 1: Lista de Estratégias */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-3">
          <div className="glass rounded-lg border border-slate-800 p-2.5 flex flex-col justify-between h-[580px] xl:h-[720px] 2xl:h-[820px] lg:h-[calc(100vh-140px)] min-h-[580px] overflow-hidden font-sans">
            <div className="flex flex-col h-full overflow-hidden">
              {/* Filtro desnecessário removido, exibe por padrão o painel ativo */}
              
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 scrollbar-hide">

                {isLoadingPrompts ? (
                  <div className="text-slate-600 text-xs text-center py-10 font-mono">Carregando estratégias...</div>
                ) : filteredPrompts.length === 0 ? (
                  <div className="text-slate-500 text-[10px] text-center py-10 font-mono">
                    Nenhuma estratégia encontrada.
                  </div>
                ) : (
                  filteredPrompts.map((p) => renderPromptCard(p))
                )}
              </div>
            </div>

            <div className="mt-3 flex gap-2 shrink-0">
              <button
                type="button"
                onClick={handleClearForm}
                className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold transition flex items-center justify-center gap-1"
              >
                ➕ Nova Estratégia
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded text-[10px] font-bold transition flex items-center justify-center gap-1"
              >
                📤 Importar JSON
              </button>
            </div>
          </div>
        </div>

        {/* Coluna 2: Formulário Simplificado */}
        <div className="col-span-12 lg:col-span-5">
          <form onSubmit={handleSave} className="glass rounded-lg border border-slate-800 p-4 flex flex-col justify-between h-[580px] xl:h-[720px] 2xl:h-[820px] lg:h-[calc(100vh-140px)] min-h-[580px] font-sans">
            <div className="space-y-3.5 overflow-y-auto pr-1 scrollbar-hide flex-1">
              <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  {selectedPrompt ? '📝 Editar Estratégia' : '➕ Criar Nova Estratégia'}
                </h3>
                {selectedPrompt && (
                  <button
                    type="button"
                    onClick={handleClearForm}
                    className="text-[9px] font-bold text-blue-400 hover:text-blue-300 bg-slate-900 border border-blue-900/50 hover:border-blue-700 px-2 py-0.5 rounded transition"
                  >
                    ➕ Nova Estratégia
                  </button>
                )}
              </div>

              <div>
                <label className="text-[10px] text-slate-400 uppercase font-mono block mb-1">Finalidade do Prompt *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPromptType('context_filter')}
                    className={`py-1.5 px-2 rounded text-[10px] font-extrabold transition flex items-center justify-center gap-1 border ${
                      promptType === 'context_filter'
                        ? 'bg-cyan-950/60 text-cyan-300 border-cyan-500 shadow-sm'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-850'
                    }`}
                  >
                    🛡️ Filtro de Contexto (Robôs)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPromptType('signal_generator')}
                    className={`py-1.5 px-2 rounded text-[10px] font-extrabold transition flex items-center justify-center gap-1 border ${
                      promptType === 'signal_generator'
                        ? 'bg-amber-950/60 text-amber-300 border-amber-500 shadow-sm'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-850'
                    }`}
                  >
                    ⚡ Gerador de Sinais (Conector)
                  </button>
                </div>
                <span className="text-[9px] text-slate-500 mt-1 block">
                  {promptType === 'context_filter'
                    ? '🛡️ Filtro de Contexto: Valida as ordens geradas pelos robôs NT8 fornecendo a nota de confiança (Compra % / Venda %).'
                    : '⚡ Gerador de Sinais: Gera ordens completas (Alvo, Stop, Sentido) disparadas diretamente pelo Conector.'}
                </span>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 uppercase font-mono block mb-1">Nome da Estratégia *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Rompimento Gamma Resistência"
                  className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 focus:border-blue-500 focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 uppercase font-mono block mb-1">Descrição</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Uma breve introdução sobre como funciona o setup..."
                  rows={2}
                  className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 focus:border-blue-500 focus:outline-none leading-relaxed resize-none text-[11px]"
                />
              </div>

              <div>
                <label className={`text-[10px] uppercase font-mono block mb-1 ${
                  promptType === 'signal_generator' ? 'text-amber-400 font-bold' : 'text-slate-400'
                }`}>
                  🤖 Algoritmo de Robô Acionador {promptType === 'signal_generator' ? '* (OBRIGATÓRIO para Gerador de Sinais)' : '(Opcional)'}
                </label>
                <select
                  value={triggerStrategyId}
                  onChange={(e) => setTriggerStrategyId(e.target.value)}
                  className={`bg-slate-900 p-2 rounded text-xs w-full text-slate-200 focus:outline-none font-mono cursor-pointer transition border ${
                    promptType === 'signal_generator' && !triggerStrategyId
                      ? 'border-amber-500/80 bg-amber-950/20 shadow-sm'
                      : 'border-slate-700 focus:border-blue-500'
                  }`}
                >
                  <option value="">
                    {promptType === 'signal_generator'
                      ? '-- Selecione o Robô Acionador Obrigatório --'
                      : '-- Sem Robô (Acionamento Manual/Tempo) --'}
                  </option>
                  {/* Se houver um triggerStrategyId já salvo que não esteja no array, renderiza opção de fallback garantindo que o select não resete */}
                  {triggerStrategyId && !allAvailableStrategies.some((s: any) => s.id === triggerStrategyId) && (
                    <option value={triggerStrategyId}>
                      ⚙️ Robô Vinculado (ID: {triggerStrategyId})
                    </option>
                  )}
                  {allAvailableStrategies.map((s: any) => {
                    const linkedPrompts = prompts.filter((p: any) => p.trigger_strategy_id === s.id && p.id !== selectedPrompt?.id);
                    const labelSuffix = linkedPrompts.length > 0
                      ? ` 🔗 (${linkedPrompts.length} prompt(s) vinculado(s))`
                      : (s.is_public ? ' 🌐' : ' 👤');
                    const statusTag = s.active ? '🟢' : '⚪ (Oculto)';
                    return (
                      <option key={s.id} value={s.id || ''}>
                        {statusTag} {s.name} ({s.action === 'position' ? 'Estratégia' : 'Indicador'}){labelSuffix}
                      </option>
                    );
                  })}
                </select>
                <span className="text-[9px] text-slate-500 mt-1 block">
                  {promptType === 'signal_generator'
                    ? '⚡ Para Gerador de Sinais: O robô acionador irá disparar a análise e a IA gerará e enviará a ordem.'
                    : '🛡️ Para Filtro de Contexto: Opcionalmente vincule a um robô para fornecer a nota de confiança antes da entrada.'}
                </span>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 uppercase font-mono block mb-1">Confluências Exigidas (Regras da IA) *</label>
                <textarea
                  required
                  value={confluences}
                  onChange={(e) => setConfluences(e.target.value)}
                  placeholder="Descreva as condições obrigatórias (Ex: 1. Z-Score acima de +1.5; 2. Velocímetro de Sentimento maior que 60%; 3. Preço testando Resistência Gamma...)"
                  rows={3}
                  className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 focus:border-blue-500 focus:outline-none leading-relaxed font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 uppercase font-mono block mb-1">Gatilho de Entrada Específico *</label>
                <textarea
                  required
                  value={triggerEntry}
                  onChange={(e) => setTriggerEntry(e.target.value)}
                  placeholder="O que aciona a entrada imediatamente (Ex: Agressão de compra forte no Delta acompanhada de ordem baleia no Block Trades)"
                  rows={2}
                  className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 focus:border-blue-500 focus:outline-none leading-relaxed font-mono text-[11px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3.5 pt-1">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase font-mono block mb-1">🛑 Stop Loss</label>
                  <select
                    value={stopLossType}
                    onChange={(e) => setStopLossType(e.target.value as any)}
                    className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 focus:border-blue-500 focus:outline-none mb-1.5 font-mono"
                  >
                    <option value="points">Pontos / Ticks</option>
                    <option value="regions">Níveis Gamma</option>
                  </select>
                  <input
                    type="text"
                    required
                    value={stopLossValue}
                    onChange={(e) => setStopLossValue(e.target.value)}
                    placeholder={stopLossType === 'regions' ? "Ex: Mín Ant ou Suporte Put" : "Ex: 80 pontos"}
                    className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 focus:border-blue-500 focus:outline-none font-mono text-[11px]"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 uppercase font-mono block mb-1">🎯 Take Profit</label>
                  <select
                    value={takeProfitType}
                    onChange={(e) => setTakeProfitType(e.target.value as any)}
                    className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 focus:border-blue-500 focus:outline-none mb-1.5 font-mono"
                  >
                    <option value="points">Pontos / Ticks</option>
                    <option value="regions">Níveis Gamma</option>
                  </select>
                  <input
                    type="text"
                    required
                    value={takeProfitValue}
                    onChange={(e) => setTakeProfitValue(e.target.value)}
                    placeholder={takeProfitType === 'regions' ? "Ex: Máx Ant ou Resistência Call" : "Ex: 150 pontos"}
                    className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 focus:border-blue-500 focus:outline-none font-mono text-[11px]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1.5">
                <input
                  type="checkbox"
                  id="analyzeChartCheckbox"
                  checked={analyzeChart}
                  onChange={(e) => setAnalyzeChart(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
                <label htmlFor="analyzeChartCheckbox" className="text-xs text-slate-300 font-semibold cursor-pointer">
                  🖼️ Analisar Visão do Gráfico (Enviar print do gráfico para a IA)
                </label>
              </div>

              {user?.email === 'admin@vortex.com' && (
                <div className="flex items-center gap-2 pt-1.5">
                  <input
                    type="checkbox"
                    id="isAdminCheckbox"
                    checked={isAdminCheckbox}
                    onChange={(e) => setIsAdminCheckbox(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-blue-500 h-4 w-4"
                  />
                  <label htmlFor="isAdminCheckbox" className="text-xs text-slate-300 font-semibold cursor-pointer">
                    👑 Registrar como Prompt Público do Administrador (Sistema)
                  </label>
                </div>
              )}
            </div>

            <div className="flex gap-2.5 pt-4 border-t border-slate-800/80 mt-2 shrink-0">
              {selectedPrompt && !selectedPrompt.is_admin && (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="px-3 py-2 bg-red-950/20 text-red-400 hover:bg-red-900/25 border border-red-900/40 rounded text-xs font-bold transition duration-200"
                >
                  🗑️ Excluir
                </button>
              )}
              
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded text-xs font-bold transition duration-200"
              >
                {isSaving ? 'Salvando...' : '💾 Salvar Estratégia'}
              </button>
            </div>
          </form>
        </div>

        {/* Coluna 3: Chat Construtor de Estratégias */}
        <div className="col-span-12 lg:col-span-4">
          <div className="glass rounded-lg border border-slate-800 flex flex-col justify-between h-[580px] xl:h-[720px] 2xl:h-[820px] lg:h-[calc(100vh-140px)] min-h-[580px] overflow-hidden font-sans">
            {/* Header do Chat */}
            <div className="bg-slate-900/60 px-3.5 py-3 border-b border-slate-800/80 flex justify-between items-center">
              <div>
                <h3 className="text-xs font-black text-white tracking-wider uppercase">
                  💬 Assistente de Estratégias
                </h3>
                <p className="text-[9px] text-slate-500">
                  Crie estratégias conversando com a IA
                </p>
              </div>
              <span className="text-[10px] bg-slate-850 px-2 py-0.5 rounded font-mono text-slate-400 border border-slate-800">
                {settings?.ai_provider.toUpperCase() || 'VORTEX'}
              </span>
            </div>

            {/* Logs/Mensagens de Chat */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3.5 scrollbar-hide bg-slate-950/20">
              {chatMessages.map((msg, idx) => {
                const isAI = msg.role === 'assistant';
                const strategyJSON = isAI ? extractStrategyJSON(msg.content) : null;
                
                return (
                  <div key={idx} className={`flex flex-col ${isAI ? 'items-start' : 'items-end'}`}>
                    <span className="text-[8px] text-slate-500 mb-1 font-mono uppercase">
                      {isAI ? '🤖 Vortex Assistente' : '👤 Você'}
                    </span>
                    
                    <div className={`p-2.5 rounded-lg text-xs leading-relaxed max-w-[90%] whitespace-pre-wrap ${
                      isAI 
                        ? 'bg-slate-900 border border-slate-800 text-slate-200' 
                        : 'bg-blue-600 text-white font-semibold'
                    }`}>
                      {msg.content}
                    </div>

                    {/* Botão para aplicar JSON */}
                    {strategyJSON && (
                      <div className="mt-2.5 bg-slate-900 border border-slate-700/60 p-2.5 rounded-lg w-[85%] shadow-lg">
                        <div className="text-[10px] font-bold text-yellow-400 font-mono flex items-center gap-1.5 mb-1.5">
                          <span>🎯</span> Estratégia Estruturada Pronta
                        </div>
                        <div className="text-[9px] text-slate-300 font-mono space-y-0.5">
                          <div><strong>Nome:</strong> {strategyJSON.name}</div>
                          <div className="truncate"><strong>SL:</strong> {strategyJSON.stop_loss_value}</div>
                          <div className="truncate"><strong>TP:</strong> {strategyJSON.take_profit_value}</div>
                        </div>
                        
                        <button
                          type="button"
                          onClick={() => handleApplyStrategyFromChat(strategyJSON)}
                          className="mt-2 w-full py-1.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded text-[9px] uppercase transition shadow-md"
                        >
                          ⚡ Aplicar no Formulário
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {isChatSending && (
                <div className="flex flex-col items-start">
                  <span className="text-[8px] text-slate-500 mb-1 font-mono uppercase">🤖 Vortex Assistente</span>
                  <div className="bg-slate-900 border border-slate-800 p-2 rounded-lg text-xs flex items-center gap-1.5 text-slate-400 font-mono">
                    <span className="animate-pulse">Pensando e estruturando</span>
                    <span className="animate-bounce">.</span>
                    <span className="animate-bounce [animation-delay:0.2s]">.</span>
                    <span className="animate-bounce [animation-delay:0.4s]">.</span>
                  </div>
                </div>
              )}

              {chatError && (
                <div className="p-2.5 rounded bg-red-950/25 border border-red-900/60 text-[10px] text-red-400 font-semibold font-mono whitespace-pre-wrap leading-relaxed">
                  ⚠️ {chatError}
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input de Chat */}
            <form onSubmit={handleSendChatMessage} className="p-2 border-t border-slate-800/80 bg-slate-900/20 flex gap-1.5 shrink-0">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ex: Sugira uma estratégia baseada em rompimento..."
                disabled={isChatSending}
                className="flex-1 bg-slate-950 border border-slate-850 rounded px-2.5 py-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none placeholder-slate-650 font-sans"
              />
              <button
                type="submit"
                disabled={isChatSending || !chatInput.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold px-3.5 rounded text-xs transition flex items-center justify-center shrink-0 font-sans"
              >
                Enviar
              </button>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
};
