export interface SubscriptionPlanDetails {
  productId: number;
  productName: string;
  isLegacyProduct: boolean;      // 7375, 8426, 8506
  isCopyTraderOnly: boolean;     // 9286 (Axion Copy NT8)
  isModularProduct: boolean;     // 9203 (Axion TradeStation)
  hasCopyNT8: boolean;           // 9286 (true), 9203 (addon 3-0 ou 'Copy NT8'), 7375/legado (true)
  hasAlgorithmCreator: boolean;  // 9203 (addon 3-1 ou 'Criador de Algoritmos'), 7375 (true), 9286 (false)
  hasCopilotAI: boolean;         // 9203 (addon 3-2 ou 'Copilot IA'), 7375 (true), 9286 (false)
  hasExtraCapacity: boolean;     // 9203 (addon 3-3 ou 'Capacidade Extra'), 9286 (addon 4-0 ou '+ 10 contas')
  maxDemoAccounts: number;       // 10 padrão, 20 com extra capacity
  maxSyncAccounts: number;       // 10 padrão, 20 com extra capacity
}

export interface SubscriptionPendingPayment {
  orderId?: number;
  status?: string;
  total?: string;
  dueDate?: string;
  bankSlipUrl?: string;     // PDF do Boleto Asaas
  invoiceUrl?: string;      // Link Asaas show / fatura
  paymentUrl?: string;      // Checkout WooCommerce
  customerNotes?: string[];
}

export interface SubscriptionValidation {
  success: boolean;
  message: string;
  data?: any;
  planDetails?: SubscriptionPlanDetails;
  isPendingPayment?: boolean;
  subscriptionStatus?: string;
  pendingPayment?: SubscriptionPendingPayment | null;
  nextPaymentDate?: string | null;
}

export function extractSubscriptionPlanDetails(subscriptionData: any): SubscriptionPlanDetails {
  const lineItems = subscriptionData?.line_items || [];
  const mainItem = lineItems[0] || {};
  const productId = Number(mainItem.product_id) || 0;
  const productName = mainItem.name || 'Produto Axion';

  // Coletar todos os metadados dos itens
  const allMetaData = lineItems.flatMap((item: any) => item.meta_data || []);
  const metaString = allMetaData.map((m: any) => {
    const k = typeof m.key === 'string' ? m.key : JSON.stringify(m.key);
    const v = typeof m.value === 'string' ? m.value : JSON.stringify(m.value);
    const dk = typeof m.display_key === 'string' ? m.display_key : '';
    const dv = typeof m.display_value === 'string' ? m.display_value : '';
    return `${k} ${v} ${dk} ${dv}`;
  }).join(' ');

  // 1. PRODUTO 9286: Axion Copy NT8 (Exclusivo Copy Trader)
  if (productId === 9286) {
    const hasExtraCapacity = /4-0|\+ 10 contas|Contas Extras/i.test(metaString);
    return {
      productId: 9286,
      productName: 'Axion Copy NT8',
      isLegacyProduct: false,
      isCopyTraderOnly: true,
      isModularProduct: false,
      hasCopyNT8: true, // Sempre ativo para o 9286
      hasAlgorithmCreator: false,
      hasCopilotAI: false,
      hasExtraCapacity,
      maxDemoAccounts: hasExtraCapacity ? 20 : 10,
      maxSyncAccounts: hasExtraCapacity ? 20 : 10
    };
  }

  // 2. PRODUTO 9203: Axion TradeStation (Modular por Add-ons)
  if (productId === 9203) {
    const hasCopyNT8 = /3-0|ywapo-addon-3-0|Copy NT8/i.test(metaString);
    const hasAlgorithmCreator = /3-1|ywapo-addon-3-1|Criador de Algoritmos/i.test(metaString);
    const hasCopilotAI = /3-2|ywapo-addon-3-2|Copilot IA/i.test(metaString);
    const hasExtraCapacity = /3-3|ywapo-addon-3-3|Capacidade Extra/i.test(metaString);

    return {
      productId: 9203,
      productName: 'Axion TradeStation',
      isLegacyProduct: false,
      isCopyTraderOnly: false,
      isModularProduct: true,
      hasCopyNT8,
      hasAlgorithmCreator,
      hasCopilotAI,
      hasExtraCapacity,
      maxDemoAccounts: hasExtraCapacity ? 20 : 10,
      maxSyncAccounts: hasExtraCapacity ? 20 : 10
    };
  }

  // 3. PRODUTOS LEGADOS (7375 - EA VM Bot NT8, 8426, 8506, etc.)
  return {
    productId: productId || 7375,
    productName: productName || 'EA VM Bot NT8',
    isLegacyProduct: true,
    isCopyTraderOnly: false,
    isModularProduct: false,
    hasCopyNT8: true,
    hasAlgorithmCreator: true,
    hasCopilotAI: true,
    hasExtraCapacity: false,
    maxDemoAccounts: 10,
    maxSyncAccounts: 10
  };
}

export async function validateWooCommerceSubscription(subscriptionId: string): Promise<SubscriptionValidation> {
  const baseUrl = import.meta.env.VITE_WOO_BASE_URL || '';
  const consumerKey = import.meta.env.VITE_WOO_CONSUMER_KEY || '';
  const consumerSecret = import.meta.env.VITE_WOO_CONSUMER_SECRET || '';
  const allowedProducts = [8426, 7375, 8506, 9203, 9286];
  const envCod = Number(import.meta.env.VITE_WOO_COD_PRODUTO);
  if (envCod && !allowedProducts.includes(envCod)) {
    allowedProducts.push(envCod);
  }

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
    
    const status = (data.status || '').toLowerCase();
    const isHoldOrPending = status === 'on-hold' || status === 'pending';
    const nextPaymentDate = data.next_payment_date_gmt || data.next_payment_date || null;

    // Se o status for de pendência financeira (on-hold ou pending), buscar detalhes do pedido e link de regularização
    if (isHoldOrPending) {
      let pendingPaymentInfo: SubscriptionPendingPayment | null = null;
      try {
        let orderToInspect: any = null;
        if (data.parent_id) {
          const orderRes = await fetch(`${baseUrl}/orders/${data.parent_id}?consumer_key=${consumerKey}&consumer_secret=${consumerSecret}`);
          if (orderRes.ok) {
            orderToInspect = await orderRes.json();
          }
        }

        if (!orderToInspect) {
          const ordersRes = await fetch(`${baseUrl}/subscriptions/${subscriptionId}/orders?consumer_key=${consumerKey}&consumer_secret=${consumerSecret}`);
          if (ordersRes.ok) {
            const ordersList = await ordersRes.json();
            if (Array.isArray(ordersList) && ordersList.length > 0) {
              const pendingOrd = ordersList.find((o: any) => o.status === 'pending' || o.status === 'on-hold') || ordersList[0];
              if (pendingOrd) {
                const fullOrdRes = await fetch(`${baseUrl}/orders/${pendingOrd.id}?consumer_key=${consumerKey}&consumer_secret=${consumerSecret}`);
                if (fullOrdRes.ok) orderToInspect = await fullOrdRes.json();
              }
            }
          }
        }

        if (orderToInspect) {
          let bankSlipUrl = '';
          let invoiceUrl = '';
          const metaList = orderToInspect.meta_data || [];
          const asaasMeta = metaList.find((m: any) => m.key === '__ASAAS_ORDER');
          if (asaasMeta && asaasMeta.value) {
            try {
              const parsedAsaas = typeof asaasMeta.value === 'string' ? JSON.parse(asaasMeta.value) : asaasMeta.value;
              bankSlipUrl = parsedAsaas.bankSlipUrl || '';
              invoiceUrl = parsedAsaas.invoiceUrl || '';
            } catch {}
          }

          // Se não encontrou no meta, verificar nas notas do pedido
          if (!invoiceUrl || !bankSlipUrl) {
            try {
              const notesRes = await fetch(`${baseUrl}/orders/${orderToInspect.id}/notes?consumer_key=${consumerKey}&consumer_secret=${consumerSecret}`);
              if (notesRes.ok) {
                const notes = await notesRes.json();
                if (Array.isArray(notes)) {
                  for (const n of notes) {
                    const text = n.note || '';
                    const match = text.match(/https?:\/\/[^\s"'<>]+/i);
                    if (match && match[0] && !invoiceUrl) {
                      invoiceUrl = match[0];
                    }
                  }
                }
              }
            } catch {}
          }

          pendingPaymentInfo = {
            orderId: orderToInspect.id,
            status: orderToInspect.status,
            total: orderToInspect.total,
            bankSlipUrl: bankSlipUrl || undefined,
            invoiceUrl: invoiceUrl || undefined,
            paymentUrl: orderToInspect.payment_url || undefined
          };
        }
      } catch (err) {
        console.warn('[WOOCOMMERCE] Falha ao recuperar pedido pendente:', err);
      }

      return {
        success: false,
        message: 'Assinatura com pagamento pendente ou suspensa. Regularize para acessar.',
        subscriptionStatus: status,
        isPendingPayment: true,
        pendingPayment: pendingPaymentInfo,
        nextPaymentDate,
        data
      };
    }

    // Se qualquer outro status que não seja active (ex: cancelled, expired)
    if (status !== 'active') {
      return { 
        success: false, 
        message: 'Assinatura cancelada ou expirada. Regularize para acessar o sistema.',
        subscriptionStatus: status,
        isPendingPayment: false,
        data
      };
    }

    // Validar Produto correspondente
    const lineItems = data.line_items || [];
    const productOk = lineItems.some((item: any) => allowedProducts.includes(Number(item.product_id)));
    
    if (!productOk) {
      return { success: false, message: 'Produto incorreto ou inválido nesta assinatura.' };
    }

    const planDetails = extractSubscriptionPlanDetails(data);

    return {
      success: true,
      message: 'Assinatura ativa e válida!',
      data,
      planDetails,
      subscriptionStatus: status,
      isPendingPayment: false,
      nextPaymentDate
    };
  } catch (error: any) {
    console.error('[WOOCOMMERCE] Erro ao validar assinatura:', error);
    return { success: false, message: `Falha na comunicação com o WordPress: ${error.message || error}` };
  }
}

export async function getWooCommerceCustomerData(customerId: number): Promise<{ email: string; username: string } | null> {
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
    return {
      email: data.email || '',
      username: data.username || ''
    };
  } catch (error) {
    console.error('[WOOCOMMERCE] Erro ao obter dados do cliente:', error);
    return null;
  }
}

