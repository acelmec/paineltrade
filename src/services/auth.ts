import { supabase } from '../supabaseClient';
import { validateWooCommerceSubscription, getWooCommerceCustomerData, type SubscriptionPlanDetails, type SubscriptionPendingPayment } from './wooCommerce';
import { DEFAULT_GENERAL_PROMPT_TEMPLATE } from './ai';

export interface AuthResult {
  success: boolean;
  message: string;
  user?: any;
  sessionId?: string;
  needsChoice?: boolean;
  planDetails?: SubscriptionPlanDetails;
  isPendingPayment?: boolean;
  subscriptionStatus?: string;
  pendingPayment?: SubscriptionPendingPayment | null;
  nextPaymentDate?: string | null;
}

// Auxiliar para gerar UUID simples no client side
function generateSessionId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
}

let cachedDrift: number | null = null;

export async function fetchTimeDrift(): Promise<number> {
  if (cachedDrift !== null) return cachedDrift;
  
  const savedDrift = localStorage.getItem('vortex_time_drift');
  if (savedDrift !== null) {
    cachedDrift = Number(savedDrift);
  }

  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    if (!supabaseUrl) return 0;

    const start = Date.now();
    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'HEAD',
      headers: {
        'apikey': supabaseAnonKey
      }
    });
    const end = Date.now();
    const serverDateHeader = res.headers.get('date');
    if (serverDateHeader) {
      const serverTime = new Date(serverDateHeader).getTime();
      const clientTime = (start + end) / 2;
      const drift = clientTime - serverTime;
      
      cachedDrift = drift;
      localStorage.setItem('vortex_time_drift', String(drift));
      console.log(`[AUTH] Sincronização de horário concluída. Drift calculado: ${drift}ms`);
      return drift;
    }
  } catch (err) {
    console.warn('[AUTH] Falha ao sincronizar horário com servidor Supabase:', err);
  }

  return cachedDrift || 0;
}

export function getServerTime(): Date {
  const drift = cachedDrift !== null ? cachedDrift : Number(localStorage.getItem('vortex_time_drift') || '0');
  return new Date(Date.now() - drift);
}

// Iniciar a sincronização de horário em background
fetchTimeDrift().catch(() => {});

export async function validateWooSubscriptionAndEmail(email: string, subscriptionId: string): Promise<{ 
  success: boolean; 
  message: string; 
  data?: any; 
  planDetails?: SubscriptionPlanDetails;
  isPendingPayment?: boolean;
  subscriptionStatus?: string;
  pendingPayment?: SubscriptionPendingPayment | null;
  nextPaymentDate?: string | null;
}> {
  if (!email || !subscriptionId) {
    return { success: false, message: 'E-mail e número de assinatura são obrigatórios.' };
  }

  // 1. Validar assinatura no WooCommerce
  const subscriptionCheck = await validateWooCommerceSubscription(subscriptionId);
  if (!subscriptionCheck.success) {
    return { 
      success: false, 
      message: subscriptionCheck.message,
      isPendingPayment: subscriptionCheck.isPendingPayment,
      subscriptionStatus: subscriptionCheck.subscriptionStatus,
      pendingPayment: subscriptionCheck.pendingPayment,
      nextPaymentDate: subscriptionCheck.nextPaymentDate,
      data: subscriptionCheck.data
    };
  }

  // 2. Verificar se o e-mail da assinatura coincide com o e-mail inserido
  const billingEmail = subscriptionCheck.data?.billing?.email || '';
  let emailMatches = billingEmail.toLowerCase() === email.toLowerCase();

  if (!emailMatches && subscriptionCheck.data?.customer_id) {
    const customerData = await getWooCommerceCustomerData(subscriptionCheck.data.customer_id);
    if (customerData?.email && customerData.email.toLowerCase() === email.toLowerCase()) {
      emailMatches = true;
    }
  }

  if (!emailMatches) {
    return { success: false, message: `Esta assinatura (${subscriptionId}) não pertence ao e-mail ${email}.` };
  }

  return { 
    success: true, 
    message: 'Assinatura válida!', 
    data: subscriptionCheck.data,
    planDetails: subscriptionCheck.planDetails,
    isPendingPayment: false,
    subscriptionStatus: subscriptionCheck.subscriptionStatus,
    nextPaymentDate: subscriptionCheck.nextPaymentDate
  };
}

export async function resetOrSetUserPassword(
  email: string,
  subscriptionId: string,
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  try {
    if (!email || !email.includes('@')) {
      return { success: false, message: 'Por favor, informe um e-mail válido.' };
    }
    if (!subscriptionId) {
      return { success: false, message: 'O número da assinatura do WordPress é obrigatório.' };
    }
    if (!newPassword || newPassword.length < 6) {
      return { success: false, message: 'A senha deve conter no mínimo 6 caracteres.' };
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanSubId = subscriptionId.trim();

    const isAdmin = cleanEmail === 'admin@vortex.com';
    if (isAdmin) {
      return { success: false, message: 'A senha de administrador deve ser gerenciada pelo sistema.' };
    }

    // 1. Validar no WooCommerce se a assinatura existe, está ativa e pertence a este e-mail
    const wooCheck = await validateWooSubscriptionAndEmail(cleanEmail, cleanSubId);
    if (!wooCheck.success) {
      return { success: false, message: wooCheck.message };
    }

    // 2. Localizar se o usuário já existe no Supabase Auth com paginação ampla
    const { data: userData, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) {
      console.error('[AUTH] Erro ao listar usuários no Supabase:', listError);
    }

    const usersList = userData?.users || [];
    const existingUser = usersList.find(u => u.email?.toLowerCase().trim() === cleanEmail);

    if (existingUser) {
      // Atualizar a senha do usuário existente
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        existingUser.id,
        { 
          password: newPassword,
          user_metadata: { subscription_id: cleanSubId }
        }
      );

      if (updateError) {
        return { success: false, message: `Erro ao atualizar senha: ${updateError.message}` };
      }

      // Garantir que painel e configurações existam
      const { data: existingPanels } = await supabase
        .from('painelvm_panels')
        .select('id')
        .eq('user_id', existingUser.id);

      if (!existingPanels || existingPanels.length === 0) {
        const { data: panelData } = await supabase
          .from('painelvm_panels')
          .insert({
            user_id: existingUser.id,
            subscription_id: cleanSubId,
            instance_id: 'painel_principal',
            name: 'Painel Principal'
          })
          .select()
          .single();

        if (panelData) {
          await createDefaultSettingsForPanel(panelData.id);
        }
      }

      return {
        success: true,
        message: 'Senha cadastrada com sucesso! Você já pode entrar com sua nova senha.'
      };
    } else {
      // Criar novo usuário com a senha escolhida
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: cleanEmail,
        password: newPassword,
        email_confirm: true,
        user_metadata: { subscription_id: cleanSubId }
      });

      if (createError) {
        return { success: false, message: `Erro ao criar usuário: ${createError.message}` };
      }

      if (newUser?.user) {
        const { data: panelData } = await supabase
          .from('painelvm_panels')
          .insert({
            user_id: newUser.user.id,
            subscription_id: subscriptionId,
            instance_id: 'painel_principal',
            name: 'Painel Principal'
          })
          .select()
          .single();

        if (panelData) {
          await createDefaultSettingsForPanel(panelData.id);
        }
      }

      return {
        success: true,
        message: 'Conta ativada e senha criada com sucesso! Você já pode realizar o login.'
      };
    }
  } catch (err: any) {
    return { success: false, message: `Erro inesperado ao definir senha: ${err.message || err}` };
  }
}

export async function updateCurrentUserPassword(newPassword: string): Promise<{ success: boolean; message: string }> {
  try {
    if (!newPassword || newPassword.length < 6) {
      return { success: false, message: 'A nova senha deve ter no mínimo 6 caracteres.' };
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      return { success: false, message: `Erro ao alterar senha: ${error.message}` };
    }
    return { success: true, message: 'Senha alterada com sucesso!' };
  } catch (err: any) {
    return { success: false, message: `Erro ao alterar senha: ${err.message || err}` };
  }
}

async function createDefaultSettingsForPanel(panelId: string) {
  try {
    await supabase.from('painelvm_settings').insert({
      panel_id: panelId,
      ai_provider: 'groq',
      groq_model: 'qwen/qwen3.8-27b',
      intervalo: 30000,
      enviar_imagem_ia: true,
      ai_trigger_mode: 'tempo',
      gamma_symbol: 'NQ',
      instance_id_market: 'painel_principal',
      instance_id_force: 'painel_principal',
      instance_id_screen: 'painel_principal',
      source_market: 'supabase',
      source_screen: 'supabase',
      card_order_desktop: 'preco_sentimento,forca,mapa,ia_delta,grafico,blocktrades,mensagens',
      card_order_mobile: 'preco_sentimento,forca,mapa,ia_delta,grafico,blocktrades,mensagens',
      disabled_levels: [
        'cfg:vortex_ai_enabled:false',
        'cfg:general_prompt_days:all',
        'cfg:chart_show_sma9:true',
        'cfg:chart_show_ema21:true',
        'cfg:chart_show_ema50:false',
        'cfg:chart_show_rsi:false',
        'cfg:chart_show_macd:false',
        'cfg:log_show_sistema:true',
        'cfg:log_show_alerta:true',
        'cfg:log_show_ia:true',
        'cfg:log_show_erro:true',
        'cfg:log_show_noticia:true',
        'cfg:market_update_interval:500',
        'cfg:general_prompt_master_enabled:false',
        'cfg:chart_candle_bar_count:60',
        'cfg:chart_manual_trade_mode:nivel',
        'cfg:chart_manual_sl_points:50',
        'cfg:chart_manual_tp_points:50',
        'cfg:chart_show_levels:true',
        'cfg:chart_confirm_manual_trade:true',
        'cfg:chart_manual_ia_validate:false',
        'cfg:alert_force_ativo:false',
        'cfg:alert_force_buy_min:-2.0',
        'cfg:alert_force_sell_max:2.0',
        'cfg:alert_force_cooldown:10',
        'cfg:alert_force_telegram:false',
        'cfg:alert_force_vies_shift:false',
        'cfg:general_prompt_enabled:false',
        'cfg:general_prompt_frequency:15',
        'cfg:general_prompt_start_time:09:00',
        'cfg:general_prompt_end_time:18:00',
        `cfg:general_prompt_template:${DEFAULT_GENERAL_PROMPT_TEMPLATE}`,
        'cfg:general_prompt_telegram_send_image:true',
        'cfg:general_prompt_telegram_enabled:true',
        'cfg:news_background_enabled:false'
      ]
    });
  } catch (e) {
    console.error('[AUTH] Erro ao criar configurações padrão:', e);
  }
}

export async function signUpUser(email: string, password: string, subscriptionId: string): Promise<AuthResult> {
  const res = await resetOrSetUserPassword(email, subscriptionId, password);
  if (!res.success) {
    return { success: false, message: res.message };
  }
  return signInUser(email, password, subscriptionId);
}

export async function signInUser(
  email: string, 
  passwordCheck?: string, 
  subscriptionIdCheck?: string,
  forcedMode?: 'admin' | 'restricted'
): Promise<AuthResult> {
  try {
    const cleanEmail = (email || '').trim().toLowerCase();
    const password = (passwordCheck || '').trim();
    const subId = (subscriptionIdCheck || '').trim();

    await fetchTimeDrift();
    if (!cleanEmail) {
      return { success: false, message: 'O e-mail é obrigatório.' };
    }
    if (!password) {
      return { success: false, message: 'A senha é obrigatória.' };
    }

    const isAdmin = cleanEmail === 'admin@vortex.com';
    const effectiveSubId = isAdmin ? 'admin' : subId;
    let wooCheck: { 
      success: boolean; 
      message: string; 
      data?: any; 
      planDetails?: SubscriptionPlanDetails;
      isPendingPayment?: boolean;
      subscriptionStatus?: string;
      pendingPayment?: SubscriptionPendingPayment | null;
      nextPaymentDate?: string | null;
    } | null = null;

    if (isAdmin) {
      if (password !== 'vortexadmin') {
        return { success: false, message: 'Senha incorreta para a conta de administrador.' };
      }
    } else {
      if (!subId) {
        return { success: false, message: 'O número da assinatura do WordPress é obrigatório.' };
      }

      // 1. Validar assinatura no WooCommerce e conferir e-mail
      wooCheck = await validateWooSubscriptionAndEmail(cleanEmail, subId);
      if (!wooCheck.success) {
        return { 
          success: false, 
          message: wooCheck.message,
          isPendingPayment: wooCheck.isPendingPayment,
          subscriptionStatus: wooCheck.subscriptionStatus,
          pendingPayment: wooCheck.pendingPayment,
          nextPaymentDate: wooCheck.nextPaymentDate
        };
      }
    }

    const ip = await getUserIp();
    const blocked = await isIpBlocked(ip);
    if (blocked) {
      return {
        success: false,
        message: 'Acesso negado: Seu IP foi bloqueado pelo administrador.'
      };
    }

    // 2. Verificar se já existe uma sessão ativa para essa assinatura (ANTES de mexer no Supabase Auth)
    const { data: existingSession } = await supabase
      .from('painelvm_users_sessions')
      .select('*')
      .eq('subscription_id', effectiveSubId)
      .maybeSingle();

    if (existingSession && !isAdmin && !forcedMode) {
      const serverTime = getServerTime().getTime();
      const lastUpdated = new Date(existingSession.updated_at).getTime();
      const isAdminActive = existingSession.session_id && (Math.abs(serverTime - lastUpdated) < 120000); // ativa nos últimos 2 min

      if (isAdminActive) {
        // Retorna a necessidade de escolha ANTES de alterar qualquer token/sessão no Supabase Auth!
        return {
          success: false,
          needsChoice: true,
          message: 'Já existe uma sessão ativa no computador. Como deseja prosseguir?'
        };
      }
    }

    // 3. Autenticar no Supabase Auth com email e a senha fornecida pelo usuário
    let user: any = null;
    const authPass = isAdmin ? 'vortexadmin_vortex_ai_pass' : password;

    const { data: authData } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: authPass
    });

    if (authData?.user) {
      user = authData.user;
    } else {
      // Se falhar o login direto, verificar se o usuário existe no Supabase Auth com paginação ampla
      const { data: userData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const usersList = userData?.users || [];
      const existingUser = usersList.find(u => u.email?.toLowerCase().trim() === cleanEmail);

      if (existingUser) {
        if (isAdmin) {
          // Sincronizar senha admin caso necessário
          await supabase.auth.admin.updateUserById(existingUser.id, { password: authPass });
          const { data: retryAdmin } = await supabase.auth.signInWithPassword({ email: cleanEmail, password: authPass });
          if (retryAdmin?.user) user = retryAdmin.user;
        } else {
          // Usuário existe mas a senha digitada falhou no Supabase Auth
          return {
            success: false,
            message: 'Senha incorreta. Se for seu primeiro acesso com senha, crie sua senha na aba "Criar / Redefinir Senha".'
          };
        }
      } else {
        // Usuário tem assinatura válida no WooCommerce mas ainda não foi registrado no Supabase Auth.
        // Criar usuário automaticamente com a senha informada
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
          email: cleanEmail,
          password: authPass,
          email_confirm: true,
          user_metadata: { subscription_id: effectiveSubId }
        });

        if (createError || !newUser?.user) {
          return { success: false, message: `Erro ao criar perfil no Supabase: ${createError?.message || 'Erro desconhecido'}` };
        }

        const { data: existingPanels } = await supabase
          .from('painelvm_panels')
          .select('id')
          .eq('user_id', newUser.user.id);

        if (!existingPanels || existingPanels.length === 0) {
          const { data: panelData } = await supabase
            .from('painelvm_panels')
            .insert({
              user_id: newUser.user.id,
              subscription_id: effectiveSubId,
              instance_id: 'painel_principal',
              name: 'Painel Principal'
            })
            .select()
            .single();

          if (panelData) {
            await createDefaultSettingsForPanel(panelData.id);
          }
        }

        // Fazer login com o novo usuário criado
        const { data: retryAuth, error: retryError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: authPass
        });

        if (retryError || !retryAuth?.user) {
          return { success: false, message: `Falha na autenticação: ${retryError?.message || 'Erro desconhecido'}` };
        }
        user = retryAuth.user;
      }
    }

    if (!user) {
      return { success: false, message: 'Falha na autenticação: Usuário não retornado.' };
    }

    // 4. Gerar nova sessão e determinar privilégio (Admin vs Restrito)
    const newSessionId = generateSessionId();
    let isRestricted = forcedMode === 'restricted';

    const updatePayload: any = {
      user_id: user.id,
      subscription_id: effectiveSubId,
      email: user.email,
      ip_address: ip,
      last_access: getServerTime().toISOString(),
      ...(existingSession ? {} : { 
        allow_alerts: true, 
        allow_operations: !wooCheck?.planDetails?.isCopyTraderOnly,
        allow_copy_trading: wooCheck?.planDetails?.hasCopyNT8 ?? true,
        allow_simulator: !wooCheck?.planDetails?.isCopyTraderOnly && (wooCheck?.planDetails?.hasAlgorithmCreator ?? true),
        allow_panel_mode_2: !wooCheck?.planDetails?.isCopyTraderOnly
      })
    };

    if (isRestricted) {
      updatePayload.session_id = existingSession?.session_id || null;
      updatePayload.updated_at = existingSession?.updated_at || null;
      updatePayload.restricted_session_id = newSessionId;
      updatePayload.restricted_updated_at = getServerTime().toISOString();
    } else {
      updatePayload.session_id = newSessionId;
      updatePayload.updated_at = getServerTime().toISOString();
      
      // Preservar a sessão restrita se ela estiver ativa
      const isRestrictedActive = existingSession && existingSession.restricted_session_id && existingSession.restricted_updated_at &&
        (Math.abs(getServerTime().getTime() - new Date(existingSession.restricted_updated_at).getTime()) < 120000);

      updatePayload.restricted_session_id = isRestrictedActive ? existingSession.restricted_session_id : null;
      updatePayload.restricted_updated_at = isRestrictedActive ? existingSession.restricted_updated_at : null;
    }

    let sessionError: any = null;
    try {
      const { error } = await supabase
        .from('painelvm_users_sessions')
        .upsert(updatePayload, { onConflict: 'subscription_id' });
      sessionError = error;
    } catch (e: any) {
      sessionError = e;
    }

    if (sessionError) {
      console.warn('[AUTH] Falha ao registrar sessão com metadados (IP/email). Tentando registrar simplificada.', sessionError);
      
      const secondaryPayload: any = {
        user_id: user.id,
        subscription_id: effectiveSubId,
      };

      if (isRestricted) {
        secondaryPayload.session_id = existingSession?.session_id || null;
        secondaryPayload.updated_at = existingSession?.updated_at || null;
        secondaryPayload.restricted_session_id = newSessionId;
        secondaryPayload.restricted_updated_at = getServerTime().toISOString();
      } else {
        secondaryPayload.session_id = newSessionId;
        secondaryPayload.updated_at = getServerTime().toISOString();
        
        const isRestrictedActive = existingSession && existingSession.restricted_session_id && existingSession.restricted_updated_at &&
          (Math.abs(getServerTime().getTime() - new Date(existingSession.restricted_updated_at).getTime()) < 120000);

        secondaryPayload.restricted_session_id = isRestrictedActive ? existingSession.restricted_session_id : null;
        secondaryPayload.restricted_updated_at = isRestrictedActive ? existingSession.restricted_updated_at : null;
      }

      const { error: secError } = await supabase
        .from('painelvm_users_sessions')
        .upsert(secondaryPayload, { onConflict: 'subscription_id' });

      if (secError) {
        console.error('[AUTH] Falha ao registrar sessão secundária no Supabase:', secError);
        return { success: false, message: `Erro ao registrar sessão: ${secError.message}` };
      }
    }

    // Guardar dados locais
    localStorage.setItem('vortex_session_id', newSessionId);
    localStorage.setItem('vortex_subscription_id', effectiveSubId);
    localStorage.setItem('vortex_is_restricted', isRestricted ? 'true' : 'false');

    let effectivePlanDetails: SubscriptionPlanDetails | undefined = undefined;
    if (isAdmin) {
      effectivePlanDetails = {
        productId: 0,
        productName: 'Administrador Vortex',
        isLegacyProduct: true,
        isCopyTraderOnly: false,
        isModularProduct: false,
        hasCopyNT8: true,
        hasAlgorithmCreator: true,
        hasCopilotAI: true,
        hasExtraCapacity: true,
        maxDemoAccounts: 999,
        maxSyncAccounts: 999
      };
      localStorage.setItem('vortex_plan_details', JSON.stringify(effectivePlanDetails));
    } else if (wooCheck?.planDetails) {
      effectivePlanDetails = wooCheck.planDetails;
      localStorage.setItem('vortex_plan_details', JSON.stringify(effectivePlanDetails));
    }

    if (wooCheck?.nextPaymentDate) {
      localStorage.setItem('vortex_next_payment_date', wooCheck.nextPaymentDate);
    } else if (isAdmin) {
      localStorage.removeItem('vortex_next_payment_date');
    }

    return {
      success: true,
      message: 'Login realizado com sucesso!',
      user,
      sessionId: newSessionId,
      planDetails: effectivePlanDetails,
      nextPaymentDate: wooCheck?.nextPaymentDate
    };
  } catch (error: any) {
    return { success: false, message: `Erro inesperado no login: ${error.message || error}` };
  }
}

export async function signOutUser() {
  const subId = localStorage.getItem('vortex_subscription_id');
  const isRestricted = localStorage.getItem('vortex_is_restricted') === 'true';
  const sessionId = localStorage.getItem('vortex_session_id');

  if (subId && sessionId) {
    try {
      if (isRestricted) {
        // Se for restrita, limpa apenas os campos da própria sessão restrita se ela ainda for a ativa no banco
        await supabase
          .from('painelvm_users_sessions')
          .update({ 
            restricted_session_id: null, 
            restricted_updated_at: null 
          })
          .eq('subscription_id', subId)
          .eq('restricted_session_id', sessionId);
      } else {
        // Se for admin/principal, limpa apenas os campos da própria sessão principal se ela ainda for a ativa no banco
        await supabase
          .from('painelvm_users_sessions')
          .update({ 
            session_id: null, 
            updated_at: null 
          })
          .eq('subscription_id', subId)
          .eq('session_id', sessionId);
      }
    } catch (err) {
      console.error('[AUTH] Erro ao limpar sessao no logout:', err);
    }
  }

  localStorage.removeItem('vortex_session_id');
  localStorage.removeItem('vortex_subscription_id');
  localStorage.removeItem('vortex_is_restricted');
  localStorage.removeItem('vortex_plan_details');
  localStorage.removeItem('vortex_user_permissions');
  localStorage.removeItem('vortex_strategy_reports_local');
  localStorage.removeItem('vortex_broker_accounts_local');
  localStorage.removeItem('vortex_copy_trading_configs');
  localStorage.removeItem('vortex_account_custom_rules');
  localStorage.removeItem('vortex_active_account_id');
  localStorage.removeItem('vortex_copilot_chat_history');

  try {
    Object.keys(localStorage).forEach(key => {
      if (
        key.startsWith('vortex_broker_accounts_local_') ||
        key.startsWith('vortex_strategy_reports_local_') ||
        key.startsWith('vortex_copy_trading_configs_') ||
        key.startsWith('vortex_account_manual_strat_id_') || 
        key.startsWith('vortex_hide_boleta_')
      ) {
        localStorage.removeItem(key);
      }
    });
  } catch (e) {}

  await supabase.auth.signOut();
}

let cachedIp: string | null = null;
export async function getUserIp(): Promise<string> {
  if (cachedIp) return cachedIp;
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json();
    if (data && data.ip) {
      cachedIp = data.ip;
      return data.ip;
    }
  } catch (err) {
    console.warn('[AUTH] Falha ao obter IP público:', err);
  }
  return '127.0.0.1';
}

export async function isIpBlocked(ip: string): Promise<boolean> {
  if (!ip || ip === '127.0.0.1' || ip === 'localhost' || ip === '::1') return false;
  try {
    const { data } = await supabase
      .from('painelvm_blocked_ips')
      .select('id')
      .eq('ip_address', ip.trim())
      .maybeSingle();
    return !!data;
  } catch (err) {
    console.error('[AUTH] Erro ao verificar IP bloqueado:', err);
    return false;
  }
}

export async function checkActiveSessionAndHeartbeat(
  userId: string, 
  localSessionId: string, 
  subscriptionId: string | null,
  isRestrictedLocal: boolean,
  email?: string
): Promise<{ 
  active: boolean; 
  role: 'admin' | 'restricted'; 
  blocked?: boolean;
  allow_telegram_news?: boolean;
  allow_alerts?: boolean;
  allow_operations?: boolean;
  allow_share_strategies?: boolean;
  allow_simulator?: boolean;
  allow_panel_mode_2?: boolean;
  allow_copy_trading?: boolean;
  max_strategies?: number;
  max_accounts?: number;
}> {
  if (!userId || !localSessionId) return { active: false, role: 'admin', max_strategies: 2, max_accounts: 5, allow_copy_trading: true };

  try {
    const ip = await getUserIp();
    const blocked = await isIpBlocked(ip);
    if (blocked) {
      return { active: false, role: 'admin', blocked: true };
    }

    if (subscriptionId === 'admin') {
      supabase
        .from('painelvm_users_sessions')
        .update({
          email: email || 'admin@vortex.com',
          ip_address: ip,
          last_access: getServerTime().toISOString(),
          updated_at: getServerTime().toISOString()
        })
        .eq('subscription_id', 'admin')
        .then(({ error: adminHeartbeatErr }) => {
          if (adminHeartbeatErr) {
            console.warn('[AUTH] Falha ao enviar heartbeat admin com metadados, tentando simplificado:', adminHeartbeatErr);
            supabase
              .from('painelvm_users_sessions')
              .update({ updated_at: getServerTime().toISOString() })
              .eq('subscription_id', 'admin')
              .then();
          }
        });

      return { 
        active: true, 
        role: 'admin',
        allow_telegram_news: true,
        allow_alerts: true,
        allow_operations: true,
        allow_share_strategies: true,
        allow_simulator: true,
        allow_panel_mode_2: true,
        allow_copy_trading: true,
        max_strategies: 999,
        max_accounts: 999
      };
    }

    await fetchTimeDrift();
    let query = supabase
      .from('painelvm_users_sessions')
      .select('*');

    if (subscriptionId) {
      query = query.eq('subscription_id', subscriptionId);
    } else {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.warn('[AUTH] Erro ao verificar sessão activa (pode ser falha temporária de rede):', error);
      return { 
        active: true, 
        role: isRestrictedLocal ? 'restricted' : 'admin',
        allow_telegram_news: !isRestrictedLocal,
        allow_alerts: !isRestrictedLocal,
        allow_operations: !isRestrictedLocal,
        allow_share_strategies: false,
        allow_simulator: false,
        allow_panel_mode_2: true,
        allow_copy_trading: true,
        max_strategies: 2,
        max_accounts: 5
      };
    }

    if (!data) {
      return { active: false, role: 'admin', max_strategies: 2, max_accounts: 5, allow_copy_trading: true };
    }

    if (isRestrictedLocal) {
      const active = data.restricted_session_id === localSessionId;
      if (active) {
        supabase
          .from('painelvm_users_sessions')
          .update({ 
            restricted_updated_at: getServerTime().toISOString(),
            email: email || data.email,
            ip_address: ip,
            last_access: getServerTime().toISOString()
          })
          .eq('id', data.id)
          .eq('restricted_session_id', localSessionId)
          .then(({ error: updateErr }) => {
            if (updateErr) {
              console.warn('[AUTH] Falha ao enviar heartbeat restrito, tentando simplificado:', updateErr);
              supabase
                .from('painelvm_users_sessions')
                .update({ restricted_updated_at: getServerTime().toISOString() })
                .eq('id', data.id)
                .eq('restricted_session_id', localSessionId)
                .then();
            }
          });
      }
      return { 
        active, 
        role: 'restricted',
        allow_telegram_news: data.allow_telegram_news !== false,
        allow_alerts: data.allow_alerts !== false,
        allow_operations: data.allow_operations !== false,
        allow_share_strategies: data.allow_share_strategies === true,
        allow_simulator: data.allow_simulator === true,
        allow_panel_mode_2: data.allow_panel_mode_2 === true,
        allow_copy_trading: data.allow_copy_trading !== false,
        max_strategies: data.max_strategies !== undefined ? Number(data.max_strategies) : 2,
        max_accounts: data.max_accounts !== undefined ? Number(data.max_accounts) : 5
      };
    } else {
      const active = data.session_id === localSessionId;
      if (active) {
        supabase
          .from('painelvm_users_sessions')
          .update({ 
            updated_at: getServerTime().toISOString(),
            email: email || data.email,
            ip_address: ip,
            last_access: getServerTime().toISOString()
          })
          .eq('id', data.id)
          .eq('session_id', localSessionId)
          .then(({ error: updateErr }) => {
            if (updateErr) {
              console.warn('[AUTH] Falha ao enviar heartbeat admin, tentando simplificado:', updateErr);
              supabase
                .from('painelvm_users_sessions')
                .update({ updated_at: getServerTime().toISOString() })
                .eq('id', data.id)
                .eq('session_id', localSessionId)
                .then();
            }
          });
      }
      return { 
        active, 
        role: 'admin',
        allow_telegram_news: data.allow_telegram_news !== false,
        allow_alerts: data.allow_alerts !== false,
        allow_operations: data.allow_operations !== false,
        allow_share_strategies: data.allow_share_strategies === true,
        allow_simulator: data.allow_simulator === true,
        allow_panel_mode_2: data.allow_panel_mode_2 === true,
        allow_copy_trading: data.allow_copy_trading !== false,
        max_strategies: data.max_strategies !== undefined ? Number(data.max_strategies) : 2,
        max_accounts: data.max_accounts !== undefined ? Number(data.max_accounts) : 5
      };
    }
  } catch (error) {
    console.error('[AUTH] Erro inesperado no heartbeat de sessão:', error);
    return { 
      active: true, 
      role: isRestrictedLocal ? 'restricted' : 'admin',
      allow_telegram_news: true,
      allow_alerts: true,
      allow_operations: !isRestrictedLocal,
      allow_share_strategies: false,
      allow_simulator: false,
      allow_panel_mode_2: true,
      allow_copy_trading: true,
      max_strategies: 2,
      max_accounts: 5
    };
  }
}

// Mantendo compatibilidade com código legador se houver
export async function checkActiveSession(userId: string, localSessionId: string, subscriptionId?: string | null): Promise<boolean> {
  const result = await checkActiveSessionAndHeartbeat(userId, localSessionId, subscriptionId || null, false);
  return result.active;
}
