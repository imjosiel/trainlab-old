import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { SessionPayload } from '@/auth/session-payload';
import { parsePage } from '@/common/pagination';
import { PrismaService } from '@/prisma/prisma.service';

export interface ListTierRequestsQuery {
  status?: string;
  page?: string;
}

export type AcaoDoAdmin = 'approved' | 'rejected';

const STATUS_VALIDOS = ['pending', 'approved', 'rejected', 'auto_approved'] as const;
const ACOES: AcaoDoAdmin[] = ['approved', 'rejected'];
const PAGE_SIZE = 100;

@Injectable()
export class TierRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(query: ListTierRequestsQuery): Promise<{ requests: unknown[] }> {
    const status = query.status ?? 'pending';
    if (!(STATUS_VALIDOS as readonly string[]).includes(status)) {
      throw new BadRequestException({
        error: `status inválido. Aceitos: ${STATUS_VALIDOS.join(', ')}`,
      });
    }

    const page = parsePage(query.page ?? '1');

    const requests = await this.prisma.partnerTierRequest.findMany({
      where: { status },
      include: {
        partner: {
          select: {
            id: true,
            user: { select: { name: true, email: true, image: true } },
            tier: { select: { name: true, slug: true } },
          },
        },
        toTier: { select: { id: true, name: true, slug: true, price: true, commissionRate: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    });

    return { requests };
  }

  async decidir(
    id: string,
    admin: SessionPayload,
    body: { action?: unknown; note?: unknown },
  ): Promise<{ success: true; message: string }> {
    const action = body.action;
    if (typeof action !== 'string' || !ACOES.includes(action as AcaoDoAdmin)) {
      throw new BadRequestException({ error: 'Ação inválida.' });
    }

    const pedido = await this.prisma.partnerTierRequest.findUnique({
      where: { id },
      include: {
        partner: { select: { id: true, tierId: true } },
        toTier: { select: { id: true, slug: true, name: true, commissionRate: true, isActive: true } },
      },
    });

    if (!pedido) throw new NotFoundException({ error: 'Pedido não encontrado.' });
    if (pedido.status !== 'pending') {
      throw new BadRequestException({ error: 'Este pedido já foi processado.' });
    }
    if (!pedido.toTier || pedido.toTier.isActive === false) {
      throw new BadRequestException({
        error:
          'O tier destino foi desativado desde o pedido. Rejeite este pedido e peça ao parceiro uma nova solicitação.',
      });
    }

    const note = typeof body.note === 'string' ? body.note : null;

    await this.aplicar(async (tx) => {
      // A escrita do pedido filtra por `status: 'pending'` (posse como filtro,
      // D17). Dois admins clicando junto: o primeiro altera 1 linha, o segundo
      // altera 0 — e 0 vira 400, não uma segunda troca de tier.
      const { count } = await tx.partnerTierRequest.updateMany({
        where: { id, status: 'pending' },
        data: {
          status: action,
          note,
          reviewedAt: new Date(),
          reviewedById: admin.id,
        },
      });

      if (count === 0) {
        throw new BadRequestException({ error: 'Este pedido já foi processado.' });
      }

      if (action === 'approved') {
        await tx.partnerAccount.update({
          where: { id: pedido.partner.id },
          data: {
            tierId: pedido.toTier!.id,
            partnerTier: pedido.toTier!.slug,
            commissionRate: pedido.toTier!.commissionRate,
          },
        });
      }
    });

    return {
      success: true,
      message:
        action === 'approved'
          ? `Tier alterado para "${pedido.toTier.name}" com sucesso.`
          : 'Pedido rejeitado.',
    };
  }

  /**
   * Override do admin — existe porque o webhook do Stripe pode falhar depois de
   * um pagamento confirmado, e alguém precisa poder consertar à mão.
   *
   * Por isso ele grava um `PartnerTierRequest` junto: uma troca de tier sem
   * rastro seria indistinguível de uma troca legítima na auditoria.
   */
  async forcarTier(
    partnerAccountId: string,
    admin: SessionPayload,
    body: { toTierId?: unknown; reason?: unknown },
  ): Promise<{ success: true; message: string }> {
    const toTierId = typeof body.toTierId === 'string' ? body.toTierId : '';
    if (!toTierId) throw new BadRequestException({ error: 'toTierId é obrigatório.' });

    const [conta, destino] = await Promise.all([
      this.prisma.partnerAccount.findUnique({
        where: { id: partnerAccountId },
        select: { id: true, tierId: true, partnerTier: true },
      }),
      this.prisma.partnerTier.findUnique({
        where: { id: toTierId },
        select: { id: true, slug: true, name: true, commissionRate: true },
      }),
    ]);

    if (!conta) throw new NotFoundException({ error: 'Parceiro não encontrado.' });
    if (!destino) throw new NotFoundException({ error: 'Tier de destino não encontrado.' });
    if (conta.tierId === destino.id) {
      throw new BadRequestException({ error: 'Parceiro já está neste tier.' });
    }

    const motivo =
      typeof body.reason === 'string' && body.reason.trim()
        ? `${body.reason.trim()} (por ${admin.email})`
        : `Atualização manual por admin (${admin.email})`;

    await this.aplicar(async (tx) => {
      await tx.partnerAccount.update({
        where: { id: conta.id },
        data: {
          tierId: destino.id,
          partnerTier: destino.slug,
          commissionRate: destino.commissionRate,
        },
      });
      await tx.partnerTierRequest.create({
        data: {
          partnerId: conta.id,
          fromTierId: conta.tierId,
          toTierId: destino.id,
          status: 'approved',
          note: motivo,
          reviewedAt: new Date(),
          reviewedById: admin.id,
        },
      });
    });

    return { success: true, message: `Tier atualizado para "${destino.name}".` };
  }

  /**
   * Tudo que move tier passa por aqui, em transação.
   *
   * `tierId`, `partnerTier` e `commissionRate` descrevem o MESMO fato comercial.
   * Mover um sem os outros deixa o parceiro num tier com a comissão de outro — e
   * comissão errada não dá erro, dá dinheiro errado.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async aplicar(trabalho: (tx: any) => Promise<void>): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.prisma.$transaction(trabalho as any);
  }
}
