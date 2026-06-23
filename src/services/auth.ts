import { supabase } from '../supabaseClient';
import { validateWooCommerceSubscription, getWooCommerceCustomerEmail } from './wooCommerce';

export interface AuthResult {
  success: boolean;
  message: string;
  user?: any;
  sessionId?: string;
}

// Auxiliar para gerar UUID simples no client side
function generateSessionId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export async function signUpUser(email: string, password: string, subscriptionId: string): Promise<AuthResult> {
  // 1. Validar assinatura com WooCommerce
  const subscriptionCheck = await validateWooCommerceSubscription(subscriptionId);
  if (!subscriptionCheck.success) {
    return { success: false, message: subscriptionCheck.message };
  }

  try {
    // 2. Registrar no Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          subscription_id: subscriptionId,
        }
      }
    });

    if (authError) {
      return { success: false, message: `Erro ao criar usuário: ${authError.message}` };
    }

    const user = authData.user;
    if (!user) {
      return { success: false, message: 'Não foi possível recuperar o usuário criado.' };
    }

    // 3. Criar painel padrão para o usuário
    const { data: panelData, error: panelError } = await supabase
      .from('painelvm_panels')
      .insert({
        user_id: user.id,
        instance_id: 'painel_principal',
        name: 'Painel Principal'
      })
      .select()
      .single();

    if (panelError) {
      console.error('[AUTH] Erro ao criar painel padrão:', panelError);
      return { success: false, message: `Cadastro efetuado, mas falhou ao criar painel: ${panelError.message}` };
    }

    // 4. Criar configurações padrão do painel
    const { error: settingsError } = await supabase
      .from('painelvm_settings')
      .insert({
        panel_id: panelData.id,
        ai_provider: 'groq',
        groq_model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        intervalo: 30000,
        enviar_imagem_ia: true,
        gamma_symbol: 'NQ',
        instance_id_market: 'nt8_main',
        instance_id_force: 'painel_principal',
        instance_id_screen: 'nt8_main',
        source_market: 'supabase',
        source_screen: 'supabase'
      });

    if (settingsError) {
      console.error('[AUTH] Erro ao criar configurações padrão:', settingsError);
    }

    // 5. Iniciar sessão de controle
    const sessionId = generateSessionId();
    const { error: sessionError } = await supabase
      .from('painelvm_users_sessions')
      .insert({
        user_id: user.id,
        session_id: sessionId,
        updated_at: new Date().toISOString()
      });

    if (sessionError) {
      console.error('[AUTH] Erro ao criar sessão inicial:', sessionError);
    }

    return {
      success: true,
      message: 'Cadastro realizado com sucesso! Verifique seu e-mail se necessário.',
      user,
      sessionId
    };
  } catch (error: any) {
    return { success: false, message: `Erro inesperado no cadastro: ${error.message || error}` };
  }
}

export async function signInUser(email: string, passwordCheck?: string, subscriptionIdCheck?: string): Promise<AuthResult> {
  try {
    const subId = subscriptionIdCheck || passwordCheck; // Aceita assinatura em qualquer um dos campos por compatibilidade
    if (!email) {
      return { success: false, message: 'O e-mail é obrigatório.' };
    }
    if (!subId) {
      return { success: false, message: 'O número da assinatura do WordPress é obrigatório.' };
    }

    // 1. Validar assinatura no WooCommerce
    const subscriptionCheck = await validateWooCommerceSubscription(subId);
    if (!subscriptionCheck.success) {
      return { success: false, message: `Assinatura inválida: ${subscriptionCheck.message}` };
    }

    // 2. Verificar se o e-mail da assinatura coincide com o e-mail inserido
    const billingEmail = subscriptionCheck.data?.billing?.email || '';
    let emailMatches = billingEmail.toLowerCase() === email.toLowerCase();

    if (!emailMatches && subscriptionCheck.data?.customer_id) {
      console.log(`[AUTH] E-mail billing (${billingEmail}) não coincide com o fornecido (${email}). Verificando e-mail da conta do cliente...`);
      const customerEmail = await getWooCommerceCustomerEmail(subscriptionCheck.data.customer_id);
      if (customerEmail && customerEmail.toLowerCase() === email.toLowerCase()) {
        console.log(`[AUTH] E-mail do cliente WooCommerce (${customerEmail}) coincide com o fornecido.`);
        emailMatches = true;
      }
    }

    if (!emailMatches) {
      return { success: false, message: `Esta assinatura não pertence ao e-mail ${email}.` };
    }

    // Senha derivada da assinatura para uso interno no Supabase Auth
    const derivedPassword = `${subId.trim()}_vortex_ai_pass`;

    // 3. Sincronizar com Supabase Auth usando o Admin API
    const { data: userData, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      console.error('[AUTH] Erro ao listar usuários no Supabase:', listError);
    }

    const usersList = userData?.users || [];
    const existingUser = usersList.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (existingUser) {
      // Usuário existe, atualizar a senha dele no Supabase para sincronizar com a assinatura atual
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        existingUser.id,
        { 
          password: derivedPassword,
          user_metadata: { subscription_id: subId }
        }
      );
      if (updateError) {
        console.error('[AUTH] Erro ao sincronizar senha no Supabase:', updateError);
      }
    } else {
      // Usuário não existe, criar no Supabase Auth e confirmar email automaticamente
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        password: derivedPassword,
        email_confirm: true,
        user_metadata: { subscription_id: subId }
      });

      if (createError) {
        return { success: false, message: `Erro ao criar perfil no Supabase: ${createError.message}` };
      }

      // Inicializar painel e configurações padrões para o novo usuário
      const { data: panelData, error: panelError } = await supabase
        .from('painelvm_panels')
        .insert({
          user_id: newUser.user.id,
          instance_id: 'painel_principal',
          name: 'Painel Principal'
        })
        .select()
        .single();

      if (panelError) {
        console.error('[AUTH] Erro ao criar painel padrão:', panelError);
      } else {
        await supabase.from('painelvm_settings').insert({
          panel_id: panelData.id,
          ai_provider: 'groq',
          groq_model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          intervalo: 30000,
          enviar_imagem_ia: true,
          gamma_symbol: 'NQ',
          instance_id_market: 'nt8_main',
          instance_id_force: 'painel_principal',
          instance_id_screen: 'nt8_main',
          source_market: 'supabase',
          source_screen: 'supabase'
        });
      }
    }

    // 4. Efetuar Login no Supabase Auth usando o e-mail e a senha derivada
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password: derivedPassword
    });

    if (authError) {
      return { success: false, message: `Falha na autenticação Supabase após sincronismo: ${authError.message}` };
    }

    const user = authData.user;
    if (!user) {
      return { success: false, message: 'Usuário não retornado.' };
    }

    // 5. Gerar nova sessão e atualizar banco de dados (Acesso Único)
    const newSessionId = generateSessionId();
    
    const { error: sessionError } = await supabase
      .from('painelvm_users_sessions')
      .upsert({
        user_id: user.id,
        session_id: newSessionId,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (sessionError) {
      console.error('[AUTH] Falha ao registrar sessão única no banco:', sessionError);
      return { success: false, message: `Erro ao registrar sessão: ${sessionError.message}` };
    }

    // Guardar dados locais
    localStorage.setItem('vortex_session_id', newSessionId);

    return {
      success: true,
      message: 'Login realizado com sucesso!',
      user,
      sessionId: newSessionId
    };
  } catch (error: any) {
    return { success: false, message: `Erro inesperado no login: ${error.message || error}` };
  }
}

export async function signOutUser() {
  localStorage.removeItem('vortex_session_id');
  await supabase.auth.signOut();
}

export async function checkActiveSession(userId: string, localSessionId: string): Promise<boolean> {
  if (!userId || !localSessionId) return false;

  try {
    const { data, error } = await supabase
      .from('painelvm_users_sessions')
      .select('session_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) {
      return false;
    }

    return data.session_id === localSessionId;
  } catch (error) {
    console.error('[AUTH] Erro ao verificar sessão ativa:', error);
    return false;
  }
}
