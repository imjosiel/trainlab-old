import { BadRequestException, NotFoundException } from '@nestjs/common';

import { SessionPayload } from '@/auth/session-payload';
import { TierRequestsService } from './tier-requests.service';

function prismaMock() {
  const tx = {
    partnerTierRequest: { update: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    partnerAccount: { update: jest.fn() },
  };
  return {
    tx,
    partnerTierRequest: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    partnerAccount: { findUnique: jest.fn(), update: jest.fn() },
    partnerTier: { findUnique: jest.fn() },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
}

type PrismaMock = ReturnType<typeof prismaMock>;

const ADMIN: SessionPayload = {
  id: 'admin-1',
  name: 'Admin',
  email: 'admin@example.com',
  image: null,
  roles: ['PROFESSIONAL'],
  systemRoles: ['ADMIN'],
  isAdmin: true,
  subscriptionStatus: null,
  subscriptionPlan: null,
  stripeCustomerId: null,
};

const PEDIDO = 'req-1';
const PARCEIRO = 'pa-1';
const TIER_DESTINO = { id: 'tier-2', slug: 'pro', name: 'Pro', commissionRate: 0.4, isActive: true };

describe('TierRequestsService', () => {
  let prisma: PrismaMock;
  let service: TierRequestsService;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new TierRequestsService(prisma as any);

    prisma.partnerTierRequest.findMany.mockResolvedValue([]);
    prisma.partnerTierRequest.findUnique.mockResolvedValue({
      id: PEDIDO,
      status: 'pending',
      partner: { id: PARCEIRO, tierId: 'tier-1' },
      toTier: TIER_DESTINO,
    });
    prisma.partnerTierRequest.updateMany.mockResolvedValue({ count: 1 });
    prisma.tx.partnerTierRequest.updateMany.mockResolvedValue({ count: 1 });
    prisma.partnerAccount.findUnique.mockResolvedValue({
      id: PARCEIRO,
      tierId: 'tier-1',
      partnerTier: 'starter',
    });
    prisma.partnerTier.findUnique.mockResolvedValue(TIER_DESTINO);
  });

  describe('listar', () => {
    it('status fora da lista → 400', async () => {
      await expect(service.listar({ status: 'deletado' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it.each([['pending'], ['approved'], ['rejected'], ['auto_approved']])(
      '[controle] aceita %s',
      async (status) => {
        await expect(service.listar({ status })).resolves.toBeDefined();
      },
    );

    it('sem status, mostra os pendentes', async () => {
      await service.listar({});
      const { where } = prisma.partnerTierRequest.findMany.mock.calls[0][0];
      expect(where).toEqual({ status: 'pending' });
    });

    it('mais recentes primeiro', async () => {
      await service.listar({});
      expect(prisma.partnerTierRequest.findMany.mock.calls[0][0].orderBy).toEqual({
        createdAt: 'desc',
      });
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * Aprovação — três campos que andam juntos
   * ────────────────────────────────────────────────────────────────────────── */

  describe('decidir', () => {
    it('ação fora de approved/rejected → 400', async () => {
      await expect(service.decidir(PEDIDO, ADMIN, { action: 'talvez' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('pedido inexistente → 404', async () => {
      prisma.partnerTierRequest.findUnique.mockResolvedValue(null);
      await expect(service.decidir(PEDIDO, ADMIN, { action: 'approved' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('pedido já processado → 400', async () => {
      prisma.partnerTierRequest.findUnique.mockResolvedValue({
        id: PEDIDO,
        status: 'approved',
        partner: { id: PARCEIRO, tierId: 'tier-1' },
        toTier: TIER_DESTINO,
      });
      await expect(service.decidir(PEDIDO, ADMIN, { action: 'approved' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('tier destino desativado desde o pedido → 400', async () => {
      prisma.partnerTierRequest.findUnique.mockResolvedValue({
        id: PEDIDO,
        status: 'pending',
        partner: { id: PARCEIRO, tierId: 'tier-1' },
        toTier: { ...TIER_DESTINO, isActive: false },
      });
      await expect(service.decidir(PEDIDO, ADMIN, { action: 'approved' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    // Os três campos descrevem o mesmo fato comercial. Mover um sem os outros
    // deixa o parceiro num tier com a comissão de outro.
    it('aprovar move tierId, partnerTier e commissionRate JUNTOS', async () => {
      await service.decidir(PEDIDO, ADMIN, { action: 'approved' });

      expect(prisma.tx.partnerAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: PARCEIRO },
          data: {
            tierId: TIER_DESTINO.id,
            partnerTier: TIER_DESTINO.slug,
            commissionRate: TIER_DESTINO.commissionRate,
          },
        }),
      );
    });

    it('aprovar e mudar o pedido acontecem na MESMA transação', async () => {
      await service.decidir(PEDIDO, ADMIN, { action: 'approved' });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.partnerAccount.update).not.toHaveBeenCalled();
    });

    it('rejeitar NÃO toca no tier do parceiro', async () => {
      await service.decidir(PEDIDO, ADMIN, { action: 'rejected', note: 'fora de política' });

      expect(prisma.tx.partnerAccount.update).not.toHaveBeenCalled();
    });

    // CONTROLE do teste acima: prova que rejeitar registra a decisão.
    it('[controle] rejeitar registra quem decidiu e quando', async () => {
      await service.decidir(PEDIDO, ADMIN, { action: 'rejected', note: 'fora de política' });

      const chamada = prisma.tx.partnerTierRequest.updateMany.mock.calls[0][0];
      expect(chamada.data).toEqual(
        expect.objectContaining({
          status: 'rejected',
          note: 'fora de política',
          reviewedById: ADMIN.id,
        }),
      );
    });

    // A decisão filtra por `status: 'pending'` na própria escrita (D17): dois
    // admins clicando junto, um altera 1 linha e o outro 0.
    it('decisão concorrente → 400, e o tier não é movido duas vezes', async () => {
      prisma.tx.partnerTierRequest.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.decidir(PEDIDO, ADMIN, { action: 'approved' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('a escrita do pedido filtra por pending, não só pelo id', async () => {
      await service.decidir(PEDIDO, ADMIN, { action: 'approved' });

      const { where } = prisma.tx.partnerTierRequest.updateMany.mock.calls[0][0];
      expect(where).toEqual(expect.objectContaining({ id: PEDIDO, status: 'pending' }));
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * Override do admin
   * ────────────────────────────────────────────────────────────────────────── */

  describe('forcarTier', () => {
    it('sem toTierId → 400', async () => {
      await expect(service.forcarTier(PARCEIRO, ADMIN, {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('parceiro inexistente → 404', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue(null);
      await expect(
        service.forcarTier(PARCEIRO, ADMIN, { toTierId: TIER_DESTINO.id }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('tier inexistente → 404', async () => {
      prisma.partnerTier.findUnique.mockResolvedValue(null);
      await expect(
        service.forcarTier(PARCEIRO, ADMIN, { toTierId: 'fantasma' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('parceiro já no tier → 400', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({
        id: PARCEIRO,
        tierId: TIER_DESTINO.id,
        partnerTier: TIER_DESTINO.slug,
      });
      await expect(
        service.forcarTier(PARCEIRO, ADMIN, { toTierId: TIER_DESTINO.id }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('move os três campos e deixa rastro de quem forçou', async () => {
      await service.forcarTier(PARCEIRO, ADMIN, { toTierId: TIER_DESTINO.id, reason: 'webhook falhou' });

      expect(prisma.tx.partnerAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            tierId: TIER_DESTINO.id,
            partnerTier: TIER_DESTINO.slug,
            commissionRate: TIER_DESTINO.commissionRate,
          },
        }),
      );

      const registro = prisma.tx.partnerTierRequest.create.mock.calls[0][0].data;
      expect(registro).toEqual(
        expect.objectContaining({
          partnerId: PARCEIRO,
          toTierId: TIER_DESTINO.id,
          status: 'approved',
          reviewedById: ADMIN.id,
        }),
      );
      expect(String(registro.note)).toContain('webhook falhou');
    });

    it('sem motivo, o rastro ainda identifica o admin', async () => {
      await service.forcarTier(PARCEIRO, ADMIN, { toTierId: TIER_DESTINO.id });

      const registro = prisma.tx.partnerTierRequest.create.mock.calls[0][0].data;
      expect(String(registro.note)).toContain(ADMIN.email as string);
    });
  });
});
