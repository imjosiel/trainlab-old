import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';

import { SessionPayload } from '@/auth/session-payload';
import { OffersService } from './offers.service';

function prismaMock() {
  const tx = {
    partnerOffer: { create: jest.fn(), update: jest.fn() },
  };
  return {
    tx,
    partnerAccount: { findUnique: jest.fn() },
    partnerOffer: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
}

type PrismaMock = ReturnType<typeof prismaMock>;

function stripeMock() {
  return {
    criarProduto: jest.fn().mockResolvedValue({ id: 'prod_1' }),
    atualizarProduto: jest.fn().mockResolvedValue(undefined),
    criarPreco: jest.fn().mockResolvedValue({ id: 'price_1' }),
  };
}

async function bodyOfRejection(promise: Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    await promise;
    throw new Error('esperava rejeição, mas resolveu');
  } catch (err) {
    if (!(err instanceof HttpException)) throw err;
    return err.getResponse() as Record<string, unknown>;
  }
}

const EU = 'prof-1';
const OUTRO = 'prof-2';
const OFFER = 'offer-1';

function sessao(over: Partial<SessionPayload> = {}): SessionPayload {
  return {
    id: EU,
    name: 'Profissional',
    email: 'prof@example.com',
    image: null,
    roles: ['PROFESSIONAL'],
    systemRoles: ['USER'],
    isAdmin: false,
    subscriptionStatus: null,
    subscriptionPlan: null,
    stripeCustomerId: null,
    ...over,
  };
}

const CONTA_APROVADA = {
  id: 'pa-1',
  userId: EU,
  status: 'approved',
  payoutsEnabled: true,
  tier: { minPrice: 50, allowHourlyRate: false },
};

describe('OffersService', () => {
  let prisma: PrismaMock;
  let stripe: ReturnType<typeof stripeMock>;
  let service: OffersService;

  beforeEach(() => {
    prisma = prismaMock();
    stripe = stripeMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new OffersService(prisma as any, stripe as any);

    prisma.partnerAccount.findUnique.mockResolvedValue(CONTA_APROVADA);
    prisma.partnerOffer.findMany.mockResolvedValue([]);
    prisma.partnerOffer.count.mockResolvedValue(0);
    prisma.partnerOffer.create.mockResolvedValue({ id: OFFER });
    prisma.partnerOffer.update.mockResolvedValue({ id: OFFER });
    prisma.tx.partnerOffer.create.mockResolvedValue({ id: OFFER });
    prisma.tx.partnerOffer.update.mockResolvedValue({ id: OFFER });
    prisma.partnerOffer.findUnique.mockResolvedValue({
      id: OFFER,
      partnerId: 'pa-1',
      price: 100,
      hourlyRate: null,
      stripeProductId: 'prod_1',
      partner: { userId: EU, status: 'approved' },
      _count: { subscriptions: 0 },
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * D79 — a página pública nunca devolve o financeiro (corrige A79)
   * ────────────────────────────────────────────────────────────────────────── */

  describe('buscarPublica (D79, corrige A79)', () => {
    it('usa select explícito, nunca include no partner', async () => {
      prisma.partnerOffer.findUnique.mockResolvedValue({
        id: OFFER, isActive: true,
        partner: { status: 'approved', user: { name: 'Ana', image: null, username: 'ana' } },
      });

      await service.buscarPublica(OFFER);

      const args = prisma.partnerOffer.findUnique.mock.calls[0][0];
      expect(args.include).toBeUndefined();
      expect(args.select).toBeDefined();
    });

    it('o select do partner NÃO tem campos financeiros', async () => {
      prisma.partnerOffer.findUnique.mockResolvedValue({
        id: OFFER, isActive: true,
        partner: { status: 'approved', user: { name: 'Ana', image: null, username: 'ana' } },
      });

      await service.buscarPublica(OFFER);

      const args = prisma.partnerOffer.findUnique.mock.calls[0][0];
      const selectDoPartner = args.select?.partner?.select ?? {};
      for (const campo of [
        'stripeAccountId', 'stripeAccountStatus', 'commissionRate', 'customCommissionRate',
        'minimumPayoutAmount', 'bonusThreshold', 'bonusRateDrop', 'payoutsFrozen',
        'motivation', 'rejectionReason', 'approvedById',
      ]) {
        expect(selectDoPartner).not.toHaveProperty(campo);
      }
    });

    it('oferta inativa → 404', async () => {
      prisma.partnerOffer.findUnique.mockResolvedValue(null);
      await expect(service.buscarPublica(OFFER)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('parceiro não aprovado → 404, mesmo com oferta ativa', async () => {
      prisma.partnerOffer.findUnique.mockResolvedValue({
        id: OFFER, isActive: true,
        partner: { status: 'pending', user: { name: 'Ana', image: null, username: 'ana' } },
      });
      await expect(service.buscarPublica(OFFER)).rejects.toBeInstanceOf(NotFoundException);
    });

    // CONTROLE: prova que o método devolve dado de verdade quando tudo está certo.
    it('[controle] oferta ativa de parceiro aprovado → 200 com o offer', async () => {
      prisma.partnerOffer.findUnique.mockResolvedValue({
        id: OFFER, isActive: true,
        partner: { status: 'approved', user: { name: 'Ana', image: null, username: 'ana' } },
      });
      const r = await service.buscarPublica(OFFER);
      expect(r.offer).toEqual(expect.objectContaining({ id: OFFER }));
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * Criação
   * ────────────────────────────────────────────────────────────────────────── */

  describe('criar', () => {
    const valido = { name: 'Plano Mensal', description: 'x', price: 100 };

    it('sem conta de parceiro → 403', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue(null);
      await expect(service.criar(sessao(), valido)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('conta não aprovada → 403', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ ...CONTA_APROVADA, status: 'pending' });
      await expect(service.criar(sessao(), valido)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('sem payoutsEnabled → 403, sem tocar no Stripe', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ ...CONTA_APROVADA, payoutsEnabled: false });
      await expect(service.criar(sessao(), valido)).rejects.toBeInstanceOf(ForbiddenException);
      expect(stripe.criarProduto).not.toHaveBeenCalled();
    });

    it('preço abaixo do mínimo do tier → 400', async () => {
      await expect(service.criar(sessao(), { ...valido, price: 10 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('preço acima do teto → 400', async () => {
      await expect(service.criar(sessao(), { ...valido, price: 10000 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('nome acima de 100 caracteres → 400', async () => {
      await expect(
        service.criar(sessao(), { ...valido, name: 'a'.repeat(101) }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('taxa de serviço quando o tier não permite → 403', async () => {
      await expect(
        service.criar(sessao(), { ...valido, hourlyRate: 50 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('[controle] taxa de serviço quando o tier permite → aceita', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({
        ...CONTA_APROVADA,
        tier: { minPrice: 50, allowHourlyRate: true },
      });
      await expect(
        service.criar(sessao(), { ...valido, hourlyRate: 30 }),
      ).resolves.toBeDefined();
    });

    // BUG-74 do legado: compensação quando o banco falha depois do Stripe.
    it('falha ao gravar no banco desativa o produto Stripe criado (compensação)', async () => {
      prisma.partnerOffer.create.mockRejectedValue(new Error('conexão caiu'));

      await expect(service.criar(sessao(), valido)).rejects.toThrow();

      expect(stripe.atualizarProduto).toHaveBeenCalledWith('prod_1', { active: false });
    });

    it('[controle] sucesso não desativa o produto', async () => {
      await service.criar(sessao(), valido);
      expect(stripe.atualizarProduto).not.toHaveBeenCalled();
    });

    it('grava o preço numérico validado, não a string do corpo', async () => {
      await service.criar(sessao(), { ...valido, price: '100' as never });
      const { data } = prisma.partnerOffer.create.mock.calls[0][0];
      expect(data.price).toBe(100);
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * Atualização — posse e versionamento
   * ────────────────────────────────────────────────────────────────────────── */

  describe('atualizar — posse', () => {
    it('quem não é dono → 404', async () => {
      prisma.partnerOffer.findUnique.mockResolvedValue({
        id: OFFER, partnerId: 'pa-1', partner: { userId: OUTRO, status: 'approved' },
        _count: { subscriptions: 0 },
      });
      await expect(
        service.atualizar(OFFER, sessao(), { isActive: false }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('[controle] dono consegue atualizar', async () => {
      await expect(
        service.atualizar(OFFER, sessao(), { isActive: false }),
      ).resolves.toBeDefined();
    });
  });

  describe('atualizar — versionamento de preço (Opção A do legado)', () => {
    it('mudar preço COM assinantes ativos cria nova versão, arquiva a atual', async () => {
      prisma.partnerOffer.findUnique.mockResolvedValue({
        id: OFFER, partnerId: 'pa-1', price: 100, hourlyRate: null,
        name: 'x', description: 'y', stripeProductId: 'prod_1',
        partner: { userId: EU, status: 'approved' },
        _count: { subscriptions: 3 },
      });

      const r = await service.atualizar(OFFER, sessao(), { price: 150 });

      expect(r.replaced).toBe(true);
      expect(prisma.tx.partnerOffer.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ price: 150, isActive: true }) }),
      );
      expect(prisma.tx.partnerOffer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: OFFER },
          data: expect.objectContaining({ isActive: false, supersededById: OFFER }),
        }),
      );
    });

    // CONTROLE: sem assinantes, o mesmo corpo edita in-place — não versiona.
    it('[controle] mudar preço SEM assinantes ativos edita in-place', async () => {
      prisma.partnerOffer.findUnique.mockResolvedValue({
        id: OFFER, partnerId: 'pa-1', price: 100, hourlyRate: null,
        name: 'x', description: 'y', stripeProductId: 'prod_1',
        partner: { userId: EU, status: 'approved' },
        _count: { subscriptions: 0 },
      });

      const r = await service.atualizar(OFFER, sessao(), { price: 150 });

      expect(r.replaced).toBeFalsy();
      expect(prisma.tx.partnerOffer.create).not.toHaveBeenCalled();
      expect(prisma.partnerOffer.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ price: 150 }) }),
      );
    });

    it('mudar só o nome, com assinantes ativos, NÃO versiona', async () => {
      prisma.partnerOffer.findUnique.mockResolvedValue({
        id: OFFER, partnerId: 'pa-1', price: 100, hourlyRate: null,
        name: 'x', description: 'y', stripeProductId: 'prod_1',
        partner: { userId: EU, status: 'approved' },
        _count: { subscriptions: 5 },
      });

      const r = await service.atualizar(OFFER, sessao(), { name: 'Novo nome' });

      expect(r.replaced).toBeFalsy();
      expect(prisma.tx.partnerOffer.create).not.toHaveBeenCalled();
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * Remoção
   * ────────────────────────────────────────────────────────────────────────── */

  describe('remover', () => {
    it('com qualquer histórico de assinante (mesmo cancelado) → 400', async () => {
      prisma.partnerOffer.findUnique.mockResolvedValue({
        id: OFFER, partnerId: 'pa-1', stripeProductId: 'prod_1',
        partner: { userId: EU, status: 'approved' },
        _count: { subscriptions: 1 },
      });
      await expect(service.remover(OFFER, sessao())).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.partnerOffer.delete).not.toHaveBeenCalled();
    });

    it('[controle] sem nenhum histórico, apaga', async () => {
      prisma.partnerOffer.findUnique.mockResolvedValue({
        id: OFFER, partnerId: 'pa-1', stripeProductId: 'prod_1',
        partner: { userId: EU, status: 'approved' },
        _count: { subscriptions: 0 },
      });
      await expect(service.remover(OFFER, sessao())).resolves.toEqual({ ok: true });
      expect(prisma.partnerOffer.delete).toHaveBeenCalledWith({ where: { id: OFFER } });
    });

    it('quem não é dono → 404', async () => {
      prisma.partnerOffer.findUnique.mockResolvedValue({
        id: OFFER, partnerId: 'pa-1', stripeProductId: 'prod_1',
        partner: { userId: OUTRO, status: 'approved' },
        _count: { subscriptions: 0 },
      });
      await expect(service.remover(OFFER, sessao())).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * Listagem
   * ────────────────────────────────────────────────────────────────────────── */

  describe('listarMinhas', () => {
    it('sem conta de parceiro → 404', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue(null);
      await expect(service.listarMinhas(sessao(), {})).rejects.toBeInstanceOf(NotFoundException);
    });

    it('admin com ?partnerId= vê ofertas de outro parceiro', async () => {
      await service.listarMinhas(sessao({ isAdmin: true, systemRoles: ['ADMIN'] }), { partnerId: 'pa-outro' });
      const { where } = prisma.partnerOffer.findMany.mock.calls[0][0];
      expect(where.partnerId).toBe('pa-outro');
    });

    it('não-admin com ?partnerId= é ignorado — vê só as próprias', async () => {
      await service.listarMinhas(sessao(), { partnerId: 'pa-outro' });
      const { where } = prisma.partnerOffer.findMany.mock.calls[0][0];
      expect(where.partnerId).toBe(CONTA_APROVADA.id);
    });
  });
});
