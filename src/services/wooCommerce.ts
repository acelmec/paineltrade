export interface SubscriptionValidation {
  success: boolean;
  message: string;
  data?: any;
}

export async function validateWooCommerceSubscription(subscriptionId: string): Promise<SubscriptionValidation> {
  const baseUrl = import.meta.env.VITE_WOO_BASE_URL || '';
  const consumerKey = import.meta.env.VITE_WOO_CONSUMER_KEY || '';
  const consumerSecret = import.meta.env.VITE_WOO_CONSUMER_SECRET || '';
  const codProduto = Number(import.meta.env.VITE_WOO_COD_PRODUTO) || 8426;

  if (!subscriptionId) {
    return { success: false, message: 'Assinatura não informada.' };
  }

  try {
    const url = `${baseUrl}/subscriptions/${subscriptionId}?consumer_key=${consumerKey}&consumer_secret=${consumerSecret}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (response.status === 404) {
      return { success: false, message: 'Assinatura inexistente no WordPress.' };
    }

    if (!response.ok) {
      return { success: false, message: `Erro HTTP ${response.status} ao validar assinatura.` };
    }

    const data = await response.json();
    
    // Validar Status
    const status = (data.status || '').toLowerCase();
    if (status !== 'active' && status !== 'on-hold') {
      return { success: false, message: `Licença não está ativa (Status: ${status}).` };
    }

    // Validar Produto correspondente
    const lineItems = data.line_items || [];
    const productOk = lineItems.some((item: any) => Number(item.product_id) === codProduto);
    
    if (!productOk) {
      return { success: false, message: 'Produto incorreto ou inválido nesta assinatura.' };
    }

    return {
      success: true,
      message: 'Assinatura ativa e válida!',
      data
    };
  } catch (error: any) {
    console.error('[WOOCOMMERCE] Erro ao validar assinatura:', error);
    return { success: false, message: `Falha na comunicação com o WordPress: ${error.message || error}` };
  }
}

export async function getWooCommerceCustomerEmail(customerId: number): Promise<string | null> {
  const baseUrl = import.meta.env.VITE_WOO_BASE_URL || '';
  const consumerKey = import.meta.env.VITE_WOO_CONSUMER_KEY || '';
  const consumerSecret = import.meta.env.VITE_WOO_CONSUMER_SECRET || '';

  if (!customerId) return null;

  try {
    const url = `${baseUrl}/customers/${customerId}?consumer_key=${consumerKey}&consumer_secret=${consumerSecret}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.email || null;
  } catch (error) {
    console.error('[WOOCOMMERCE] Erro ao obter e-mail do cliente:', error);
    return null;
  }
}

