import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { SessionPayload } from '@/auth/session-payload';
import { PrismaService } from '@/prisma/prisma.service';
import { StripeService } from './stripe.service';

export interface ListOffersQuery {
  page?: string;
  partnerId?: string;
}

export interface CreateOfferBody {
  name?: unknown;
  description?: unknown;
  price?: unknown;
  hourlyRate?: unknown;
  hourlyLabel?: unknown;
}

export interface UpdateOfferBody extends Partial<CreateOfferBody> {
  isActive?: unknown;
}

const PAGE_SIZE = 50;
const MAX_PRICE = 9999.99;
const MAX_NOME = 100;
const MAX_DESCRICAO = 500;
const MAX_LABEL = 60;

const SUBS_FINANCEIRAS_ATIVAS = ['active', 'canceling', 'trialing', 'past_due'];

/** Só o que a página de venda pública precisa (D79, corrige A79). NUNCA `include`. */
const SELECT_PUBLICO = {
  id: true,
  name: true,
  description: true,
  price: true,
  hourlyRate: true,
  hourlyLabel: true,
  partner: {
    select: {
      status: true,
      user: { select: { name: true, image: true, username: true } },
    },
  },
  _count: { select: { subscriptions: { where: { status: 'active' as const } } } },
} as const;

@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
  ) {}

  async listarMinhas(
    user: SessionPayload,
    query: ListOffersQuery,
  ): Promise<{ offers: unknown[]; tier: unknown; total: number; page: number; pages: number }> {
    let partnerAccountId: string;
    let tierInfo: { allowHourlyRate: boolean; minPrice: number } | null = null;

    if (query.partnerId && user.isAdmin) {
      partnerAccountId = query.partnerId;
    } else {
      const minhaConta = await this.prisma.partnerAccount.findUnique({
        where: { userId: user.id },
        include: { tier: { select: { allowHourlyRate: true, minPrice: true } } },
      });
      if (!minhaConta) throw new NotFoundException({ error: 'Conta de parceiro não encontrada.' });

      partnerAccountId = minhaConta.id;
      tierInfo = {
        allowHourlyRate: minhaConta.tier?.allowHourlyRate ?? false,
        minPrice: minhaConta.tier?.minPrice ?? 0,
      };
    }

    const page = Math.max(1, Number.isFinite(parseInt(query.page ?? '1', 10)) ? parseInt(query.page ?? '1', 10) : 1);

    const [offers, total] = await Promise.all([
      this.prisma.partnerOffer.findMany({
        where: { partnerId: partnerAccountId },
        orderBy: { createdAt: 'desc' },
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
        include: { _count: { select: { subscriptions: { where: { status: 'active' } } } } },
      }),
      this.prisma.partnerOffer.count({ where: { partnerId: partnerAccountId } }),
    ]);

    return { offers, tier: tierInfo, total, page, pages: Math.ceil(total / PAGE_SIZE) };
  }

  async buscarPublica(id: string): Promise<{ offer: unknown }> {
    const offer = await this.prisma.partnerOffer.findUnique({
      where: { id, isActive: true },
      select: SELECT_PUBLICO,
    });

    if (!offer || offer.partner.status !== 'approved') {
      throw new NotFoundException({ error: 'Oferta não encontrada ou inativa.' });
    }

    return { offer };
  }

  async criar(user: SessionPayload, body: CreateOfferBody): Promise<{ offer: { id: string } }> {
    const conta = await this.prisma.partnerAccount.findUnique({
      where: { userId: user.id },
      include: { tier: true },
    });
    if (!conta || conta.status !== 'approved') {
      throw new ForbiddenException({ error: 'Você precisa ser um parceiro aprovado para criar ofertas.' });
    }
    if (!conta.payoutsEnabled) {
      throw new ForbiddenException({ error: 'Configure sua conta bancária antes de criar ofertas.' });
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > MAX_NOME) {
      throw new BadRequestException({ error: `Nome obrigatório e com máximo de ${MAX_NOME} caracteres.` });
    }

    const description = body.description !== undefined ? String(body.description) : '';
    if (description.length > MAX_DESCRICAO) {
      throw new BadRequestException({ error: `Descrição deve ter no máximo ${MAX_DESCRICAO} caracteres.` });
    }

    const minAllowedPrice = conta.tier?.minPrice ?? 0;
    const price = parseFloat(String(body.price));
    if (!Number.isFinite(price) || price < minAllowedPrice) {
      throw new BadRequestException({ error: `Preço mínimo para o seu Tier: R$ ${minAllowedPrice.toFixed(2)}.` });
    }
    if (price > MAX_PRICE) {
      throw new BadRequestException({ error: `Preço máximo: R$ ${MAX_PRICE.toFixed(2)}.` });
    }

    let hourlyRate = 0;
    if (body.hourlyRate !== undefined && body.hourlyRate !== null && body.hourlyRate !== '') {
      hourlyRate = parseFloat(String(body.hourlyRate));
      if (hourlyRate > 0) {
        if (!conta.tier?.allowHourlyRate) {
          throw new ForbiddenException({ error: 'Seu plano de parceiro não permite taxa de serviço.' });
        }
        if (!Number.isFinite(hourlyRate) || hourlyRate < 0 || hourlyRate > MAX_PRICE) {
          throw new BadRequestException({ error: `Taxa de serviço inválida (máximo R$ ${MAX_PRICE.toFixed(2)}).` });
        }
      }
    }

    const totalPrice = price + hourlyRate;
    const hourlyLabel =
      typeof body.hourlyLabel === 'string' ? body.hourlyLabel.trim().slice(0, MAX_LABEL) : undefined;

    // BUG-74 do legado: Stripe primeiro, banco depois. Se o banco falhar, o
    // produto Stripe é desativado como compensação — não há transação que
    // amarre banco e Stripe.
    let produto: { id: string } | undefined;
    try {
      produto = await this.stripe.criarProduto({
        name: `${name} (por ${user.name})`,
        description: description || `Assinatura mensal dos treinos de ${user.name}`,
        metadata: { partnerAccountId: conta.id, basePrice: String(price), hourlyRate: String(hourlyRate) },
      });

      const preco = await this.stripe.criarPreco({
        productId: produto.id,
        unitAmountEmCentavos: Math.round(totalPrice * 100),
        metadata: { partnerAccountId: conta.id },
      });

      const offer = await this.prisma.partnerOffer.create({
        data: {
          partnerId: conta.id,
          name,
          description,
          price,
          hourlyRate: hourlyRate > 0 ? hourlyRate : null,
          hourlyLabel: hourlyRate > 0 ? (hourlyLabel || 'Taxa de serviço') : null,
          stripeProductId: produto.id,
          stripePriceId: preco.id,
          isActive: true,
        },
      });

      return { offer };
    } catch (erro) {
      if (produto?.id) {
        await this.stripe.atualizarProduto(produto.id, { active: false }).catch(() => {});
      }
      throw erro;
    }
  }

  async atualizar(
    id: string,
    user: SessionPayload,
    body: UpdateOfferBody,
  ): Promise<{ offer: { id: string }; replaced?: boolean }> {
    const atual = await this.prisma.partnerOffer.findUnique({
      where: { id },
      include: {
        partner: { select: { userId: true } },
        _count: { select: { subscriptions: { where: { status: { in: SUBS_FINANCEIRAS_ATIVAS } } } } },
      },
    });
    if (!atual || atual.partner.userId !== user.id) {
      throw new NotFoundException({ error: 'Oferta não encontrada.' });
    }

    if (body.isActive !== undefined) {
      const ativa = Boolean(body.isActive);
      if (atual.stripeProductId) await this.stripe.atualizarProduto(atual.stripeProductId, { active: ativa });
      const offer = await this.prisma.partnerOffer.update({ where: { id }, data: { isActive: ativa } });
      return { offer };
    }

    const priceChanged = body.price !== undefined && Number(body.price) !== atual.price;
    const hourlyChanged = body.hourlyRate !== undefined && body.hourlyRate !== atual.hourlyRate;
    const hasActiveSubs = atual._count.subscriptions > 0;

    if ((priceChanged || hourlyChanged) && hasActiveSubs) {
      const newPrice = body.price !== undefined ? Number(body.price) : atual.price;
      const newHourly = body.hourlyRate !== undefined ? (body.hourlyRate as number | null) : atual.hourlyRate;
      const newName = typeof body.name === 'string' ? body.name.trim() : atual.name;
      const newDesc = typeof body.description === 'string' ? body.description.trim() : atual.description;
      const newHourlyLabel =
        body.hourlyLabel !== undefined
          ? (typeof body.hourlyLabel === 'string' ? body.hourlyLabel.trim().slice(0, MAX_LABEL) : null) || null
          : atual.hourlyLabel;

      const nova = await this.prisma.$transaction(async (tx) => {
        const criada = await tx.partnerOffer.create({
          data: {
            partnerId: atual.partnerId,
            name: newName,
            description: newDesc,
            price: newPrice,
            hourlyRate: newHourly === null || newHourly === 0 ? null : newHourly,
            hourlyLabel: newHourlyLabel,
            isActive: true,
          },
        });
        await tx.partnerOffer.update({
          where: { id: atual.id },
          data: { isActive: false, archivedAt: new Date(), supersededById: criada.id },
        });
        return criada;
      });

      if (atual.stripeProductId) {
        await this.stripe.atualizarProduto(atual.stripeProductId, { active: false }).catch(() => {});
      }

      return { offer: nova, replaced: true };
    }

    const dadosDeAtualizacao: Record<string, unknown> = {};
    if (typeof body.name === 'string') dadosDeAtualizacao.name = body.name.trim();
    if (typeof body.description === 'string') dadosDeAtualizacao.description = body.description.trim();
    if (body.price !== undefined) dadosDeAtualizacao.price = Number(body.price);
    if (body.hourlyRate !== undefined) {
      dadosDeAtualizacao.hourlyRate = body.hourlyRate === null || body.hourlyRate === 0 ? null : body.hourlyRate;
      dadosDeAtualizacao.hourlyLabel =
        (typeof body.hourlyLabel === 'string' ? body.hourlyLabel.trim().slice(0, MAX_LABEL) : null) || null;
    }

    if (atual.stripeProductId && dadosDeAtualizacao.name) {
      await this.stripe.atualizarProduto(atual.stripeProductId, {
        name: dadosDeAtualizacao.name as string,
        ...(dadosDeAtualizacao.description ? { description: dadosDeAtualizacao.description as string } : {}),
      });
    }

    const offer = await this.prisma.partnerOffer.update({ where: { id }, data: dadosDeAtualizacao });
    return { offer };
  }

  async remover(id: string, user: SessionPayload): Promise<{ ok: true }> {
    const atual = await this.prisma.partnerOffer.findUnique({
      where: { id },
      include: { partner: { select: { userId: true } }, _count: { select: { subscriptions: true } } },
    });
    if (!atual || atual.partner.userId !== user.id) {
      throw new NotFoundException({ error: 'Oferta não encontrada.' });
    }

    // Bloqueia qualquer histórico, não só assinantes ativos — apagar perderia o
    // registro financeiro de quem já pagou algum dia.
    if (atual._count.subscriptions > 0) {
      throw new BadRequestException({
        error:
          'Não é possível excluir uma oferta que possui histórico de assinantes (ativos ou cancelados). ' +
          'Para revogá-la, basta desativá-la.',
      });
    }

    if (atual.stripeProductId) await this.stripe.atualizarProduto(atual.stripeProductId, { active: false });
    await this.prisma.partnerOffer.delete({ where: { id } });
    return { ok: true };
  }
}
