import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';

export interface Transferencia {
  id: string;
}

export interface TransferenciaComMetadata {
  id: string;
  metadata: Record<string, string>;
}

export interface ChargeStripe {
  id: string;
  invoiceId: string | null;
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
  status: string | null;
  paymentStatus: string;
  metadata: Record<string, string>;
  subscriptionId: string | null;
  customerId: string | null;
  customerEmail: string | null;
}

export interface SessaoDeCheckoutRedirect {
  id: string;
  url: string | null;
}

export interface SessaoDoPortal {
  url: string;
}

export interface ProdutoStripe {
  id: string;
}

export interface PrecoStripe {
  id: string;
}

export interface ContaConectada {
  id: string;
}

export interface SessaoDeConta {
  clientSecret: string | null;
}

export interface StatusDaContaConectada {
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  disabledReason: string | null;
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
   * Sem `try/catch` aqui de propósito: quem chama (`B2BWebhookService`,
   * `CreditsWebhookService`) decide o que fazer com a falha — devolver 400 é
   * responsabilidade do controller, não desta porta.
   *
   * O segredo é passado pelo chamador, não resolvido aqui (fatia 20): cada
   * endpoint dedicado tem o próprio segredo de assinatura no Painel da
   * Stripe, e esta porta não deveria saber quantos webhooks existem.
   */
  verificarAssinatura(corpo: string, assinatura: string | null, segredo: string | undefined): EventoStripe {
    if (!segredo) throw new Error('Segredo de assinatura do webhook ausente.');
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
      status: sessao.status,
      paymentStatus: sessao.payment_status,
      metadata: (sessao.metadata ?? {}) as Record<string, string>,
      subscriptionId: sessao.subscription ? String(sessao.subscription) : null,
      customerId: sessao.customer ? String(sessao.customer) : null,
      customerEmail: sessao.customer_details?.email ?? null,
    };
  }

  /**
   * D95 (fatia 21) — BUG-16 do legado: busca paginada por `metadata.userId`
   * antes de criar, pra não duplicar conta Connect se o parceiro clicar duas
   * vezes no setup. `stripe.accounts.list({ limit: 100 })` sozinho falhava
   * acima de 100 parceiros — daí a paginação com `starting_after`.
   */
  async buscarOuCriarContaConectada(dados: {
    userId: string;
    email?: string | null;
    partnerAccountId: string;
  }): Promise<ContaConectada> {
    let startingAfter: string | undefined;
    for (;;) {
      const pagina = await this.sdk().accounts.list({
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });

      const encontrada = pagina.data.find((conta) => conta.metadata?.userId === dados.userId);
      if (encontrada) {
        await this.sdk()
          .accounts.update(encontrada.id, {
            metadata: { userId: dados.userId, partnerAccountId: dados.partnerAccountId },
          })
          .catch(() => {});
        return { id: encontrada.id };
      }

      if (!pagina.has_more) break;
      startingAfter = pagina.data[pagina.data.length - 1].id;
    }

    const conta = await this.sdk().accounts.create({
      type: 'custom',
      country: 'BR',
      email: dados.email ?? undefined,
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      business_profile: { mcc: '7999' },
      business_type: 'individual',
      metadata: { userId: dados.userId, partnerAccountId: dados.partnerAccountId },
    });
    return { id: conta.id };
  }

  /**
   * D97 (fatia 22) — irmã de `buscarOuCriarContaConectada`, não a mesma
   * função generalizada: capabilities diferentes (afiliado só recebe
   * repasse, não cobra ninguém — sem `card_payments`), busca filtra também
   * por `metadata.type === 'affiliate'` (sem isso, a mesma pessoa sendo
   * parceiro E afiliado faria o setup de um reaproveitar a conta do outro),
   * e a chave de metadata é `affiliateAccountId`.
   */
  async buscarOuCriarContaConectadaDeAfiliado(dados: {
    userId: string;
    email?: string | null;
    affiliateAccountId: string;
  }): Promise<ContaConectada> {
    let startingAfter: string | undefined;
    for (;;) {
      const pagina = await this.sdk().accounts.list({
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });

      const encontrada = pagina.data.find(
        (conta) => conta.metadata?.userId === dados.userId && conta.metadata?.type === 'affiliate',
      );
      if (encontrada) {
        await this.sdk()
          .accounts.update(encontrada.id, {
            metadata: { userId: dados.userId, affiliateAccountId: dados.affiliateAccountId, type: 'affiliate' },
          })
          .catch(() => {});
        return { id: encontrada.id };
      }

      if (!pagina.has_more) break;
      startingAfter = pagina.data[pagina.data.length - 1].id;
    }

    const conta = await this.sdk().accounts.create({
      type: 'custom',
      country: 'BR',
      email: dados.email ?? undefined,
      capabilities: { transfers: { requested: true } },
      business_profile: { mcc: '7999' },
      business_type: 'individual',
      metadata: { userId: dados.userId, affiliateAccountId: dados.affiliateAccountId, type: 'affiliate' },
    });
    return { id: conta.id };
  }

  async criarSessaoDeConta(
    stripeAccountId: string,
    components: Record<string, { enabled: boolean }>,
  ): Promise<SessaoDeConta> {
    const sessao = await this.sdk().accountSessions.create({
      account: stripeAccountId,
      components: components as Stripe.AccountSessionCreateParams['components'],
    });
    return { clientSecret: sessao.client_secret };
  }

  async buscarContaConectada(stripeAccountId: string): Promise<StatusDaContaConectada> {
    const conta = await this.sdk().accounts.retrieve(stripeAccountId);
    return {
      payoutsEnabled: conta.payouts_enabled === true,
      chargesEnabled: conta.charges_enabled === true,
      disabledReason: conta.requirements?.disabled_reason ?? null,
    };
  }

  /**
   * D100 (fatia 24) — modo redirect clássico, irmão de `criarSessaoDeCheckoutAssinatura`
   * (que é `ui_mode: 'embedded'`). Usa um Stripe Price já existente em vez de
   * `price_data` inline — quem chama decide o price, esta porta só cria a sessão.
   */
  async criarSessaoDeCheckoutRedirect(dados: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    destinoDaTransferencia?: string | null;
    percentualDeTaxa?: number | null;
    metadata: Record<string, string>;
  }): Promise<SessaoDeCheckoutRedirect> {
    const sessao = await this.sdk().checkout.sessions.create({
      customer: dados.customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: dados.priceId, quantity: 1 }],
      success_url: dados.successUrl,
      cancel_url: dados.cancelUrl,
      subscription_data: {
        metadata: dados.metadata,
        ...(dados.destinoDaTransferencia
          ? {
              transfer_data: { destination: dados.destinoDaTransferencia },
              ...(dados.percentualDeTaxa != null ? { application_fee_percent: dados.percentualDeTaxa } : {}),
            }
          : {}),
      },
      metadata: dados.metadata,
    });
    return { id: sessao.id, url: sessao.url };
  }

  /**
   * D101 (fatia 24) — cria produto e preço juntos num único `prices.create`
   * com `product_data`. Diferente do par `criarProduto`+`criarPreco` (dois
   * `create()` separados, usado pelo fluxo de tiers gratuitos): esse formato
   * é o que o legado de `checkout-partner-tier` usa, não generalizado com o
   * par existente.
   */
  async criarPrecoComProduto(dados: {
    unitAmountEmCentavos: number;
    currency: 'brl' | 'usd';
    productName: string;
    metadata: Record<string, string>;
  }): Promise<PrecoStripe> {
    const preco = await this.sdk().prices.create({
      unit_amount: dados.unitAmountEmCentavos,
      currency: dados.currency,
      recurring: { interval: 'month' },
      product_data: { name: dados.productName, metadata: dados.metadata },
    });
    return { id: preco.id };
  }

  /** Busca um Price ativo já criado pra este tier+moeda+valor, pra não duplicar produto a cada checkout. */
  async buscarPrecoExistenteDoTier(dados: {
    tierId: string;
    currency: 'brl' | 'usd';
    unitAmountEmCentavos: number;
  }): Promise<PrecoStripe | null> {
    const produtos = await this.sdk()
      .products.search({ query: `metadata['tierId']:'${dados.tierId}' AND active:'true'`, limit: 1 })
      .catch(() => ({ data: [] as Stripe.Product[] }));
    if (produtos.data.length === 0) return null;

    const precos = await this.sdk().prices.list({
      product: produtos.data[0].id,
      currency: dados.currency,
      active: true,
      limit: 1,
    });
    const encontrado = precos.data.find(
      (p) => p.unit_amount === dados.unitAmountEmCentavos && p.recurring?.interval === 'month',
    );
    return encontrado ? { id: encontrado.id } : null;
  }

  async criarSessaoDoPortal(dados: { customerId: string; returnUrl: string }): Promise<SessaoDoPortal> {
    const sessao = await this.sdk().billingPortal.sessions.create({
      customer: dados.customerId,
      return_url: dados.returnUrl,
    });
    return { url: sessao.url };
  }

  /** Fatia 25 — o `AffiliateEarning` não guarda o `transferId`, então reverter exige achá-lo por metadata. */
  async listarTransferenciasPorDestino(destino: string, limite = 100): Promise<TransferenciaComMetadata[]> {
    const pagina = await this.sdk().transfers.list({ destination: destino, limit: limite });
    return pagina.data.map((t) => ({ id: t.id, metadata: (t.metadata ?? {}) as Record<string, string> }));
  }

  async reverterTransferencia(
    transferId: string,
    valorEmCentavos: number,
    metadata: Record<string, string>,
    idempotencyKey?: string,
  ): Promise<void> {
    await this.sdk().transfers.createReversal(
      transferId,
      { amount: valorEmCentavos, metadata },
      idempotencyKey ? { idempotencyKey } : undefined,
    );
  }

  /**
   * `charge.invoice` foi removido do tipo `Charge` do SDK só na API version
   * `2025-03-31` — a fixada aqui é `2025-02-24.acacia`, anterior a essa
   * remoção, e o campo continua vindo de verdade na resposta HTTP. O pacote
   * `stripe` instalado é que traz os tipos da versão mais nova por padrão,
   * então o gap é só de tipagem — daí o cast, não uma mudança de desenho.
   */
  async buscarCharge(chargeId: string): Promise<ChargeStripe> {
    const charge = await this.sdk().charges.retrieve(chargeId);
    const invoice = (charge as unknown as { invoice: string | { id: string } | null }).invoice;
    const invoiceId = invoice ? (typeof invoice === 'string' ? invoice : invoice.id) : null;
    return { id: charge.id, invoiceId };
  }
}
