import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { AdminSubscriptionsService } from './admin-subscriptions.service';

function p2002() {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
}

function prismaMock() {
  return {
    user: { findUnique: jest.fn() },
    partnerOffer: { findMany: jest.fn(), findUnique: jest.fn() },
    partnerSubscription: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
}

type PrismaMock = ReturnType<typeof prismaMock>;

const ALVO = 'aluno-1';
const OUTRO_ALUNO = 'aluno-2';
const SUB = 'sub-1';

describe('AdminSubscriptionsService', () => {
  let prisma: PrismaMock;
  let service: AdminSubscriptionsService;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AdminSubscriptionsService(prisma as any);

    prisma.user.findUnique.mockResolvedValue({ id: ALVO, email: 'aluno@example.com' });
    prisma.partnerOffer.findMany.mockResolvedValue([]);
    prisma.partnerSubscription.findMany.mockResolvedValue([]);
    prisma.partnerOffer.findUnique.mockResolvedValue({ id: 'offer-1', partnerId: 'pa-1' });
    prisma.partnerSubscription.create.mockResolvedValue({ id: SUB });
  });

  describe('conceder', () => {
    it('usuário inexistente → 404', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.conceder(ALVO, 'offer-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('sem offerId → 400', async () => {
      await expect(service.conceder(ALVO, undefined)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('oferta inexistente → 404', async () => {
      prisma.partnerOffer.findUnique.mockResolvedValue(null);
      await expect(service.conceder(ALVO, 'offer-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    // Mesma trava do D78: o admin também passa pelo índice, não por findFirst
    // manual — um único caminho de escrita, sem regra duplicada.
    it('duplicata (índice do D78) vira 409', async () => {
      prisma.partnerSubscription.create.mockRejectedValue(p2002());
      await expect(service.conceder(ALVO, 'offer-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('grava sem stripeSubscriptionId — é assinatura de teste', async () => {
      await service.conceder(ALVO, 'offer-1');
      const { data } = prisma.partnerSubscription.create.mock.calls[0][0];
      expect(data.stripeSubscriptionId).toBeUndefined();
    });

    it('[controle] concede com sucesso', async () => {
      const r = await service.conceder(ALVO, 'offer-1');
      expect(r).toEqual(expect.objectContaining({ ok: true }));
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * O achado do legado (BUG 43 fix, já corrigido lá) — aqui é desenho desde o
   * início: revogar não pode alcançar assinatura de outro usuário.
   * ────────────────────────────────────────────────────────────────────────── */

  describe('revogar — IDOR', () => {
    it('subscriptionId de OUTRO usuário → 404, e nada muda', async () => {
      // A busca da posse filtra por userId; simular "não achou para este usuário".
      prisma.partnerSubscription.findFirst.mockResolvedValue(null);

      await expect(service.revogar(ALVO, SUB)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.partnerSubscription.update).not.toHaveBeenCalled();
    });

    it('a busca de posse filtra por id E userId, não só por id', async () => {
      prisma.partnerSubscription.findFirst.mockResolvedValue({ id: SUB, userId: ALVO });

      await service.revogar(ALVO, SUB);

      const { where } = prisma.partnerSubscription.findFirst.mock.calls[0][0];
      expect(where).toEqual(expect.objectContaining({ id: SUB, userId: ALVO }));
    });

    // CONTROLE: sem ele, o teste acima passaria mesmo se o serviço nunca
    // revogasse nada.
    it('[controle] subscriptionId do PRÓPRIO usuário → revoga', async () => {
      prisma.partnerSubscription.findFirst.mockResolvedValue({ id: SUB, userId: ALVO });

      const r = await service.revogar(ALVO, SUB);

      expect(r.ok).toBe(true);
      expect(prisma.partnerSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: SUB }, data: { status: 'canceled' } }),
      );
    });

    it('sem subscriptionId → 400', async () => {
      await expect(service.revogar(ALVO, undefined)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('listarParaUsuario', () => {
    it('traz ofertas ativas e as assinaturas do usuário', async () => {
      await service.listarParaUsuario(ALVO);
      expect(prisma.partnerOffer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
      expect(prisma.partnerSubscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: ALVO } }),
      );
    });
  });
});
