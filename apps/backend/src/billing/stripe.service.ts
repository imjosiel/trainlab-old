import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';

export interface Transferencia {
  id: string;
}

export interface EventoStripe {
  id: string;
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: { object: any };
  account?: string;
}

export interface ClienteStripe {
  id: string;
}

export interface SessaoDeCheckout {
  id: string;
  clientSecret: string | null;
}

export interface AssinaturaStripe {
  status: string;
  cancelAtPeriodEnd: boolean;
}

export interface SessaoDeCheckoutDeCreditos {
  id: string;
  url: string | null;
}

export interface SessaoDeCheckoutRecuperada {
  id: string;
  paymentStatus: string;
  metadata: Record<string, string>;
  subscriptionId: string | null;
  customerId: string | null;
  customerEmail: string | null;
}

export interface ProdutoStripe {
  id: string;
}

export interface PrecoStripe {
  id: string;
}

// Mesma API version do legado — trocar de versão é decisão própria, não desta migração.
const API_VERSION = '2025-02-24.acacia' as Stripe.LatestApiVersion;

/**
 * Porta do Stripe (D66 aplicado a dinheiro).
 *
 * Mesma razão de teste das portas anteriores — `RealtimeService`, `CalendarService`:
 * as propriedades desta fatia são sobre ORDEM ("não transferiu antes de reservar")
 * e sobre CONTAGEM ("transferiu uma vez, não duas"), e nenhuma delas é
 * demonstrável com o SDK chamado de dentro do serviço de domínio.
 *
 * Aqui a porta importa mais que nas outras: `transferir` move dinheiro de
 * verdade e não tem desfazer barato.
 *
 * Cresceu na segunda metade da fatia 15 para cobrir checkout e gestão de
 * assinatura B2B — mesma justificativa: `OffersService`/`SubscriptionsService`
 * não devem saber que existe SDK do Stripe, só que existe "criar checkout",
 * "cancelar assinatura".
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private cliente: Stripe | null = null;

  /**
   * Preguiçoso, como o `RealtimeService` e o `CalendarService`: instanciar no
   * boot faria a ausência de `STRIPE_SECRET_KEY` derrubar o processo inteiro,
   * inclusive rotas sem relação nenhuma com pagamento.
   */
  private sdk(): Stripe {
    if (this.cliente) return this.cliente;

    const chave = process.env.STRIPE_SECRET_KEY;
    if (!chave) {
      throw new Error('STRIPE_SECRET_KEY ausente — operação de pagamento não pode prosseguir.');
    }

    this.cliente = new Stripe(chave, { apiVersion: API_VERSION });
    return this.cliente;
  }

  /**
   * Verifica a assinatura do webhook. Lança se o corpo não bate com o segredo.
   *
   * Sem `try/catch` aqui de propósito: quem chama (`B2BWebhookService`) decide
   * o que fazer com a falha — devolver 400 é responsabilidade do controller, não
   * desta porta.
   */
  verificarAssinatura(corpo: string, assinatura: string | null): EventoStripe {
    const segredo = process.env.STRIPE_WEBHOOK_SECRET_B2B ?? process.env.STRIPE_WEBHOOK_SECRET;
    if (!segredo) throw new Error('STRIPE_WEBHOOK_SECRET_B2B ausente.');
    if (!assinatura) throw new Error('Cabeçalho stripe-signature ausente.');

    const evento = this.sdk().webhooks.constructEvent(corpo, assinatura, segredo);
    return evento as unknown as EventoStripe;
  }

  async transferir(entrada: {
    valorEmCentavos: number;
    destino: string;
    metadata: Record<string, string>;
  }): Promise<Transferencia> {
    const transferencia = await this.sdk().transfers.create({
      amount: entrada.valorEmCentavos,
      currency: 'brl',
      destination: entrada.destino,
      metadata: entrada.metadata,
    });
    return { id: transferencia.id };
  }

  async cancelarAssinatura(stripeSubscriptionId: string, stripeAccountId?: string | null): Promise<void> {
    // O legado tenta primeiro na conta conectada (destination charge), e cai
    // para a conta da plataforma se a primeira tentativa falhar — cobre os dois
    // desenhos de cobrança que o produto já usou.
    try {
      await this.sdk().subscriptions.cancel(
        stripeSubscriptionId,
        undefined,
        stripeAccountId ? { stripeAccount: stripeAccountId } : undefined,
      );
    } catch (erro) {
      if (!stripeAccountId) throw erro;
      await this.sdk().subscriptions.cancel(stripeSubscriptionId);
    }
  }

  async atualizarAssinatura(
    stripeSubscriptionId: string,
    dados: { cancelAtPeriodEnd: boolean },
    stripeAccountId?: string | null,
  ): Promise<void> {
    try {
      await this.sdk().subscriptions.update(
        stripeSubscriptionId,
        { cancel_at_period_end: dados.cancelAtPeriodEnd },
        stripeAccountId ? { stripeAccount: stripeAccountId } : undefined,
      );
    } catch (erro) {
      if (!stripeAccountId) throw erro;
      await this.sdk().subscriptions.update(stripeSubscriptionId, {
        cancel_at_period_end: dados.cancelAtPeriodEnd,
      });
    }
  }

  /**
   * A86 — releitura deliberada, não cache do payload do webhook.
   *
   * `customer.subscription.created` e `.updated` são eventos DIFERENTES, e o
   * Stripe não garante ordem de entrega entre eles. Um `created` (retrato de
   * antes do pagamento confirmar, `status: 'incomplete'`) pode chegar DEPOIS
   * de um `updated` já `active` — reproduzido de verdade num checkout local.
   * Confiar no `status` de qualquer um dos dois payloads é confiar em quem
   * chegou por último, não em quem está certo.
   *
   * Perguntar direto pra Stripe elimina a corrida em vez de tentar ordená-la:
   * não depende de comparar timestamp (que só tem resolução de segundo, e os
   * dois eventos podem cair no mesmo segundo — foi o que aconteceu aqui).
   */
  async recuperarAssinatura(stripeSubscriptionId: string): Promise<AssinaturaStripe> {
    const assinatura = await this.sdk().subscriptions.retrieve(stripeSubscriptionId);
    return { status: assinatura.status, cancelAtPeriodEnd: assinatura.cancel_at_period_end };
  }

  async encontrarOuCriarCliente(email: string, nome?: string | null): Promise<ClienteStripe> {
    const existentes = await this.sdk().customers.list({ email, limit: 1 });
    if (existentes.data.length > 0) return { id: existentes.data[0].id };

    const criado = await this.sdk().customers.create({ email, name: nome ?? undefined });
    return { id: criado.id };
  }

  async criarProduto(dados: {
    name: string;
    description?: string;
    metadata?: Record<string, string>;
  }): Promise<ProdutoStripe> {
    const produto = await this.sdk().products.create({
      name: dados.name,
      description: dados.description,
      metadata: dados.metadata,
    });
    return { id: produto.id };
  }

  async atualizarProduto(
    id: string,
    dados: { active?: boolean; name?: string; description?: string },
  ): Promise<void> {
    await this.sdk().products.update(id, dados);
  }

  async criarPreco(dados: {
    productId: string;
    unitAmountEmCentavos: number;
    metadata?: Record<string, string>;
  }): Promise<PrecoStripe> {
    const preco = await this.sdk().prices.create({
      product: dados.productId,
      unit_amount: dados.unitAmountEmCentavos,
      currency: 'brl',
      recurring: { interval: 'month' },
      metadata: dados.metadata,
    });
    return { id: preco.id };
  }

  async criarSessaoDeCheckoutAssinatura(dados: {
    customerId: string;
    returnUrl: string;
    priceAmountEmCentavos: number;
    productName: string;
    destinoDaTransferencia?: string | null;
    percentualDeTaxa?: number | null;
    metadata: Record<string, string>;
  }): Promise<SessaoDeCheckout> {
    const sessao = await this.sdk().checkout.sessions.create({
      customer: dados.customerId,
      mode: 'subscription',
      ui_mode: 'embedded',
      return_url: dados.returnUrl,
      line_items: [
        {
          price_data: {
            currency: 'brl',
            product_data: { name: dados.productName },
            unit_amount: dados.priceAmountEmCentavos,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      subscription_data: {
        metadata: dados.metadata,
        ...(dados.destinoDaTransferencia
          ? {
              transfer_data: { destination: dados.destinoDaTransferencia },
              ...(dados.percentualDeTaxa != null
                ? { application_fee_percent: dados.percentualDeTaxa }
                : {}),
            }
          : {}),
      },
      metadata: dados.metadata,
    });

    return { id: sessao.id, clientSecret: sessao.client_secret };
  }

  /**
   * D93 (fatia 19) — pagamento único, hospedado (não embedded como o de
   * assinatura): sem parceiro, sem comissão, é a plataforma vendendo direto.
   */
  async criarSessaoDeCheckoutDeCreditos(dados: {
    customerId?: string;
    customerEmail?: string;
    successUrl: string;
    cancelUrl: string;
    currency: 'brl' | 'usd';
    productName: string;
    productDescription: string;
    unitAmountEmCentavos: number;
    metadata: Record<string, string>;
  }): Promise<SessaoDeCheckoutDeCreditos> {
    const sessao = await this.sdk().checkout.sessions.create({
      mode: 'payment',
      customer: dados.customerId,
      customer_email: dados.customerId ? undefined : dados.customerEmail,
      line_items: [
        {
          price_data: {
            currency: dados.currency,
            product_data: { name: dados.productName, description: dados.productDescription },
            unit_amount: dados.unitAmountEmCentavos,
          },
          quantity: 1,
        },
      ],
      metadata: dados.metadata,
      success_url: dados.successUrl,
      cancel_url: dados.cancelUrl,
    });

    return { id: sessao.id, url: sessao.url };
  }

  async recuperarSessaoDeCheckout(sessionId: string): Promise<SessaoDeCheckoutRecuperada> {
    const sessao = await this.sdk().checkout.sessions.retrieve(sessionId);

    return {
      id: sessao.id,
      paymentStatus: sessao.payment_status,
      metadata: (sessao.metadata ?? {}) as Record<string, string>,
      subscriptionId: sessao.subscription ? String(sessao.subscription) : null,
      customerId: sessao.customer ? String(sessao.customer) : null,
      customerEmail: sessao.customer_details?.email ?? null,
    };
  }
}
