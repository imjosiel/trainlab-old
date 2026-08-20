import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AffiliatesService } from '@/affiliates/affiliates.service';
import { AppModule } from '@/app.module';
import { SessionPayload } from '@/auth/session-payload';
import { StripeService } from '@/billing/stripe.service';
import { PrismaService } from '@/prisma/prisma.service';

const TAG = 'e2e-affiliate-flush-corrida';

/**
 * D98 — a mesma classe de propriedade do D89 (fatia 17, créditos): o lock
 * atômico do flush (`updateMany` pending→flushing antes de transferir) só é
 * provado por concorrência real. Um mock de `updateMany` devolve o que
 * mandarem, então uma mutação que apagasse o `where` da trava passaria ilesa
 * pelos testes unitários — só o Postgres real, com dois `sincronizar()`
 * disparados ao mesmo tempo, prova que nenhum earning é transferido duas
 * vezes.
 *
 * `StripeService` é substituído por um fake: a propriedade sob teste é do
 * Postgres (a trava), não da Stripe — chamar a API de verdade só adicionaria
 * latência de rede sem provar nada a mais.
 */
describe('sincronizar — corrida contra Postgres real (trava atômica do flush)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let affiliates: AffiliatesService;

  const transferencias: string[] = [];

  let afiliadoUserId: string;
  let parceiroUserId: string;
  let affiliateAccountId: string;
  let partnerAccountId: string;
  const earningIds: string[] = [];

  beforeAll(async () => {
    process.env.NEXTAUTH_SECRET = 'e2e-secret-nao-usado-em-producao';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StripeService)
      .useValue({
        buscarContaConectada: async () => ({ payoutsEnabled: true, chargesEnabled: true, disabledReason: null }),
        transferir: async (dados: { metadata: { earningId: string } }) => {
          // Atraso deliberado: alarga a janela entre ler os earnings e
          // marcá-los, pra dar tempo da OUTRA chamada concorrente também
          // alcançar a seção crítica — sem isso as duas chamadas podem
          // nunca se sobrepor de verdade, e o teste passaria mesmo sem
          // travar nada (mesma armadilha do D89).
          await new Promise((resolve) => setTimeout(resolve, 30));
          transferencias.push(dados.metadata.earningId);
          return { id: `tr_fake_${dados.metadata.earningId}` };
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    affiliates = app.get(AffiliatesService);

    const afiliadoUser = await prisma.user.create({
      data: { email: `${TAG}-affiliate@example.com`, name: `${TAG} affiliate`, roles: ['AFFILIATE'] },
    });
    afiliadoUserId = afiliadoUser.id;

    const parceiroUser = await prisma.user.create({
      data: { email: `${TAG}-partner@example.com`, name: `${TAG} partner`, roles: ['PARTNER_B2B'] },
    });
    parceiroUserId = parceiroUser.id;

    const affiliateAccount = await prisma.affiliateAccount.create({
      data: {
        userId: afiliadoUserId,
        referralCode: `${TAG}-ref`,
        stripeAccountId: 'acct_fake_e2e',
        payoutsEnabled: false,
        pendingBalance: 10000,
      },
    });
    affiliateAccountId = affiliateAccount.id;

    const partnerAccount = await prisma.partnerAccount.create({
      data: { userId: parceiroUserId, status: 'approved', affiliateAccountId },
    });
    partnerAccountId = partnerAccount.id;

    const earningsData = [
      { earnedAmount: 5000, invoiceId: `${TAG}-inv-1` },
      { earnedAmount: 5000, invoiceId: `${TAG}-inv-2` },
    ];
    for (const dados of earningsData) {
      const earning = await prisma.affiliateEarning.create({
        data: {
          affiliateId: affiliateAccountId,
          partnerId: partnerAccountId,
          grossAmount: dados.earnedAmount,
          baseAmount: dados.earnedAmount,
          earnedAmount: dados.earnedAmount,
          commissionRate: 0.5,
          status: 'pending',
          invoiceId: dados.invoiceId,
        },
      });
      earningIds.push(earning.id);
    }
  });

  afterAll(async () => {
    await prisma.affiliateEarning.deleteMany({ where: { affiliateId: affiliateAccountId } });
    await prisma.partnerAccount.deleteMany({ where: { id: partnerAccountId } });
    await prisma.affiliateAccount.deleteMany({ where: { id: affiliateAccountId } });
    await prisma.user.deleteMany({ where: { id: { in: [afiliadoUserId, parceiroUserId] } } });
    await app?.close();
  });

  it('duas sincronizações simultâneas: cada earning pendente é transferido exatamente uma vez', async () => {
    const user: SessionPayload = {
      id: afiliadoUserId,
      name: null,
      email: null,
      image: null,
      roles: ['AFFILIATE'],
      systemRoles: ['USER'],
      isAdmin: false,
      subscriptionStatus: null,
      subscriptionPlan: null,
      stripeCustomerId: null,
    };

    const [r1, r2] = await Promise.all([affiliates.sincronizar(user), affiliates.sincronizar(user)]);

    // A propriedade é sobre a SOMA das duas chamadas: as 2 earnings, juntas,
    // não podem ter sido transferidas mais de uma vez cada. Qual das duas
    // chamadas "ganhou" o lock é timing, não é o que a trava garante.
    const totalFlushado = (r1.flushedEarnings ?? 0) + (r2.flushedEarnings ?? 0);
    expect(totalFlushado).toBe(2);
    expect(transferencias).toHaveLength(2);
    expect(new Set(transferencias).size).toBe(2); // nenhum earningId repetido

    const contaFinal = await prisma.affiliateAccount.findUnique({ where: { id: affiliateAccountId } });
    expect(contaFinal?.pendingBalance).toBe(0);
    expect(contaFinal?.availableBalance).toBe(10000);

    const earningsFinal = await prisma.affiliateEarning.findMany({ where: { id: { in: earningIds } } });
    expect(earningsFinal.every((e) => e.status === 'available')).toBe(true);
  });
});
