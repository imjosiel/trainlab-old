import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '@/prisma/prisma.service';

export interface GrantOrRevokeBody {
  action?: unknown;
  offerId?: unknown;
  subscriptionId?: unknown;
}

/** `code` só existe em erro do Prisma; entrada não confiável até provar o contrário. */
function ehViolacaoDeUnicidade(erro: unknown): boolean {
  if (typeof erro !== 'object' || erro === null) return false;
  return (erro as { code?: unknown }).code === 'P2002';
}

/**
 * Override do admin: concede ou revoga assinatura B2B manualmente, sem Stripe.
 * O achado do legado é IDOR simples — revogar sem checar que a assinatura
 * pertence ao `userId` do path — mas o comentário do próprio código (`BUG 43
 * fix`) mostra que já foi corrigido lá. Aqui a checagem faz parte do desenho
 * desde o início, não é um remendo.
 *
 * `conceder` passa pelo MESMO índice único parcial do D78 — não reimplementa
 * `findFirst`. Um caminho de escrita só, para toda origem de assinatura.
 */
@Injectable()
export class AdminSubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listarParaUsuario(userId: string): Promise<{ offers: unknown[]; subscriptions: unknown[] }> {
    const [offers, subscriptions] = await Promise.all([
      this.prisma.partnerOffer.findMany({
        where: { isActive: true },
        include: { partner: { select: { id: true, user: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.partnerSubscription.findMany({
        where: { userId },
        include: { offer: { select: { name: true, partner: { select: { user: { select: { name: true } } } } } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { offers, subscriptions };
  }

  async conceder(userId: string, offerId: unknown): Promise<{ ok: true; subscription: unknown }> {
    if (typeof offerId !== 'string' || !offerId) {
      throw new BadRequestException({ error: 'offerId obrigatório' });
    }

    const target = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
    if (!target) throw new NotFoundException({ error: 'Usuário não encontrado' });

    const offer = await this.prisma.partnerOffer.findUnique({ where: { id: offerId }, select: { id: true, partnerId: true } });
    if (!offer) throw new NotFoundException({ error: 'Oferta não encontrada' });

    try {
      const subscription = await this.prisma.partnerSubscription.create({
        data: {
          offerId,
          partnerId: offer.partnerId,
          userId: target.id,
          email: target.email!,
          status: 'active',
          // stripeSubscriptionId e stripeCustomerId ficam null — assinatura de teste.
        },
      });
      return { ok: true, subscription };
    } catch (erro) {
      if (ehViolacaoDeUnicidade(erro)) {
        throw new ConflictException({ error: 'Usuário já possui assinatura ativa com este treinador' });
      }
      throw erro;
    }
  }

  async revogar(userId: string, subscriptionId: unknown): Promise<{ ok: true; message: string }> {
    if (typeof subscriptionId !== 'string' || !subscriptionId) {
      throw new BadRequestException({ error: 'subscriptionId obrigatório' });
    }

    // Posse como filtro da leitura (D17): busca já exige o par id+userId, não
    // só o id. Assinatura de outro usuário é indistinguível de inexistente.
    const alvo = await this.prisma.partnerSubscription.findFirst({
      where: { id: subscriptionId, userId },
    });
    if (!alvo) throw new NotFoundException({ error: 'Assinatura não encontrada para este usuário.' });

    await this.prisma.partnerSubscription.update({ where: { id: subscriptionId }, data: { status: 'canceled' } });
    return { ok: true, message: 'Assinatura B2B cancelada com sucesso' };
  }
}
