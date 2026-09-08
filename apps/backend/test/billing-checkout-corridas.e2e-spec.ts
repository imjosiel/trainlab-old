import { ConflictException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '@/app.module';
import { SubscriptionsService } from '@/billing/subscriptions.service';
import { PrismaService } from '@/prisma/prisma.service';

const TAG = 'e2e-checkout-corrida';

/**
 * Fatia 15, segunda metade — a propriedade de concorrência que só o SERVIÇO
 * (não o índice sozinho) pode provar: que `checkout()` devolve 409 de verdade
 * quando perde a corrida, e não deixa o P2002 vazar como 500.
 *
 * O índice em si já foi provado no A78/D78, direto contra Prisma. Este arquivo
 * prova a camada de cima: o SubscriptionsService construído sobre ele.
 */
describe('checkout — corrida contra Postgres real (D78 aplicado ao serviço)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let subscriptions: SubscriptionsService;

  const usuarios = new Set<string>();
  const tiers = new Set<string>();
  let ofertaGratisId: string;
  let partnerAccountId: string;
  let alunoId: string;

  beforeAll(async () => {
    process.env.NEXTAUTH_SECRET = 'e2e-secret-nao-usado-em-producao';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    subscriptions = app.get(SubscriptionsService);

    const criarUsuario = async (sufixo: string) => {
      const u = await prisma.user.create({
        data: { email: `${TAG}-${sufixo}@example.com`, name: `${TAG} ${sufixo}` },
      });
      usuarios.add(u.id);
      return u;
    };

    const profissional = await criarUsuario('prof');
    const aluno = await criarUsuario('aluno');
    alunoId = aluno.id;

    const tier = await prisma.partnerTier.create({
      data: { slug: `${TAG}-tier`, name: `${TAG} tier`, commissionRate: 0.5, minPrice: 0 },
    });
    tiers.add(tier.id);

    const conta = await prisma.partnerAccount.create({
      data: {
        userId: profissional.id,
        status: 'approved',
        tierId: tier.id,
        payoutsEnabled: true,
        chargesEnabled: true,
      },
    });
    partnerAccountId = conta.id;

    const oferta = await prisma.partnerOffer.create({
      data: { partnerId: conta.id, name: `${TAG} grátis`, description: 'd', price: 0, isActive: true },
    });
    ofertaGratisId = oferta.id;
  });

  afterAll(async () => {
    await prisma.partnerSubscription.deleteMany({ where: { userId: alunoId } });
    await prisma.student.deleteMany({ where: { userId: alunoId } });
    await prisma.partnerOffer.deleteMany({ where: { id: ofertaGratisId } });
    await prisma.partnerAccount.deleteMany({ where: { id: partnerAccountId } });
    await prisma.partnerTier.deleteMany({ where: { id: { in: [...tiers] } } });
    await prisma.user.deleteMany({ where: { id: { in: [...usuarios] } } });
    await app?.close();
  });

  function sessaoDoAluno() {
    return {
      id: alunoId,
      name: 'Aluno',
      email: `${TAG}-aluno@example.com`,
      image: null,
      roles: ['CLIENT'],
      systemRoles: ['USER'],
      isAdmin: false,
      subscriptionStatus: null,
      subscriptionPlan: null,
      stripeCustomerId: null,
    };
  }

  it('três checkouts simultâneos do mesmo aluno com o mesmo parceiro: exatamente um sucesso', async () => {
    const tentativas = await Promise.allSettled([
      subscriptions.checkout(ofertaGratisId, sessaoDoAluno(), {}),
      subscriptions.checkout(ofertaGratisId, sessaoDoAluno(), {}),
      subscriptions.checkout(ofertaGratisId, sessaoDoAluno(), {}),
    ]);

    const sucessos = tentativas.filter((t) => t.status === 'fulfilled');
    const conflitos = tentativas.filter(
      (t) => t.status === 'rejected' && t.reason instanceof ConflictException,
    );

    expect(sucessos).toHaveLength(1);
    expect(conflitos).toHaveLength(2);

    const naTabela = await prisma.partnerSubscription.count({
      where: { userId: alunoId, partnerId: partnerAccountId },
    });
    expect(naTabela).toBe(1);
  });
});
