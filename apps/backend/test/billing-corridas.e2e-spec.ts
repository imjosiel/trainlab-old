import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '@/app.module';
import { AffiliateCommissionService } from '@/billing/affiliate-commission.service';
import { StripeService } from '@/billing/stripe.service';
import { WebhookClaimService } from '@/billing/webhook-claim.service';
import { PrismaService } from '@/prisma/prisma.service';

const TAG = 'e2e-billing';

/**
 * Fatia 15 — as duas propriedades de CONCORRÊNCIA.
 * Spec: docs/implementation-plans/epic-nest-assinatura-cliente.md
 *
 * Este arquivo existe porque os unitários dessas duas peças são encenação: o
 * P2002 vem de um mock, ou seja, sou eu quem decide quem perde a corrida. O que
 * o A74 e o A75 afirmam é que **o banco** arbitra — a chave primária de
 * `ProcessedWebhookEvent` e a `@@unique([invoiceId, affiliateId])` de
 * `AffiliateEarning`.
 *
 * Só aqui duas transações disputam a mesma chave de verdade.
 */
describe('billing — corridas contra Postgres real', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let claims: WebhookClaimService;
  let comissoes: AffiliateCommissionService;
  let stripe: StripeService;

  const eventos = new Set<string>();
  const usuarios = new Set<string>();
  const tiers = new Set<string>();
  let ofertaId: string;
  let afiliadoId: string;
  let afiliadoUserId: string;

  beforeAll(async () => {
    process.env.NEXTAUTH_SECRET = 'e2e-secret-nao-usado-em-producao';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    claims = app.get(WebhookClaimService);
    comissoes = app.get(AffiliateCommissionService);
    stripe = app.get(StripeService);
  });

  afterAll(async () => {
    await prisma.processedWebhookEvent.deleteMany({ where: { eventId: { in: [...eventos] } } });
    await prisma.affiliateEarning.deleteMany({ where: { affiliateId: afiliadoId } });
    await prisma.partnerOffer.deleteMany({ where: { id: ofertaId } });
    await prisma.affiliateAccount.deleteMany({ where: { userId: { in: [...usuarios] } } });
    await prisma.partnerAccount.deleteMany({ where: { userId: { in: [...usuarios] } } });
    await prisma.partnerTier.deleteMany({ where: { id: { in: [...tiers] } } });
    await prisma.user.deleteMany({ where: { id: { in: [...usuarios] } } });
    await app?.close();
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * A74 / D75 — a chave primária como trava
   * ────────────────────────────────────────────────────────────────────────── */

  describe('reivindicação de evento (D75)', () => {
    function novoEvento(sufixo: string) {
      const id = `${TAG}-evt-${sufixo}-${process.pid}`;
      eventos.add(id);
      return id;
    }

    it('duas reivindicações SIMULTÂNEAS: só uma passa — quem arbitra é o banco', async () => {
      const evento = novoEvento('corrida');

      const [a, b] = await Promise.all([claims.reivindicar(evento), claims.reivindicar(evento)]);

      expect([a, b].filter((r) => r === 'reivindicado')).toHaveLength(1);
      expect([a, b].filter((r) => r === 'em_andamento')).toHaveLength(1);
      expect(await prisma.processedWebhookEvent.count({ where: { eventId: evento } })).toBe(1);
    });

    it('dez simultâneas: exatamente uma passa', async () => {
      const evento = novoEvento('dez');

      const resultados = await Promise.all(
        Array.from({ length: 10 }, () => claims.reivindicar(evento)),
      );

      expect(resultados.filter((r) => r === 'reivindicado')).toHaveLength(1);
    });

    it('concluído não é reprocessado', async () => {
      const evento = novoEvento('concluido');

      expect(await claims.reivindicar(evento)).toBe('reivindicado');
      await claims.concluir(evento);

      expect(await claims.reivindicar(evento)).toBe('ja_processado');
    });

    // CONTROLE do teste acima: sem `concluir`, o mesmo evento continua barrado
    // por estar em andamento — e não por já ter terminado. Os dois motivos
    // devolvem coisas diferentes de propósito.
    it('[controle] reivindicado e NÃO concluído responde em_andamento', async () => {
      const evento = novoEvento('em-andamento');

      expect(await claims.reivindicar(evento)).toBe('reivindicado');
      expect(await claims.reivindicar(evento)).toBe('em_andamento');
    });

    it('liberar devolve o evento para reprocessamento — é o antídoto da tranca', async () => {
      const evento = novoEvento('liberado');

      await claims.reivindicar(evento);
      await claims.liberar(evento);

      expect(await prisma.processedWebhookEvent.count({ where: { eventId: evento } })).toBe(0);
      expect(await claims.reivindicar(evento)).toBe('reivindicado');
    });

    it('claim expirado é retomado, e por apenas UM entre vários', async () => {
      const evento = novoEvento('expirado');
      await claims.reivindicar(evento);

      // Envelhece a reserva além da janela, direto no banco.
      await prisma.processedWebhookEvent.update({
        where: { eventId: evento },
        data: { claimedAt: new Date(Date.now() - 60 * 60 * 1000) },
      });

      const resultados = await Promise.all(
        Array.from({ length: 5 }, () => claims.reivindicar(evento)),
      );

      expect(resultados.filter((r) => r === 'reivindicado')).toHaveLength(1);
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * A75 / D76 — a unicidade protegendo a transferência
   * ────────────────────────────────────────────────────────────────────────── */

  describe('comissão de afiliado (D76)', () => {
    let transferencias: number;

    beforeAll(async () => {
      const criarUsuario = async (sufixo: string) => {
        const u = await prisma.user.create({
          data: { email: `${TAG}-${sufixo}@example.com`, name: `${TAG} ${sufixo}` },
        });
        usuarios.add(u.id);
        return u;
      };

      const parceiro = await criarUsuario('parceiro');
      const afiliado = await criarUsuario('afiliado');
      afiliadoUserId = afiliado.id;

      const tier = await prisma.partnerTier.create({
        data: {
          slug: `${TAG}-tier`,
          name: `${TAG} tier`,
          commissionRate: 0.5,
          affiliateCommissionRate: 0.1,
        },
      });
      tiers.add(tier.id);

      const contaAfiliado = await prisma.affiliateAccount.create({
        data: {
          userId: afiliado.id,
          referralCode: `${TAG}-ref-${process.pid}`,
          status: 'approved',
          payoutsEnabled: true,
          stripeAccountId: `acct_e2e_${process.pid}`,
        },
      });
      afiliadoId = contaAfiliado.id;

      const contaParceiro = await prisma.partnerAccount.create({
        data: {
          userId: parceiro.id,
          status: 'approved',
          tierId: tier.id,
          affiliateAccountId: contaAfiliado.id,
        },
      });

      const oferta = await prisma.partnerOffer.create({
        data: {
          partnerId: contaParceiro.id,
          name: `${TAG} oferta`,
          description: 'oferta de teste',
          price: 100,
          isActive: true,
        },
      });
      ofertaId = oferta.id;
    });

    beforeEach(() => {
      transferencias = 0;
      // A porta do Stripe é substituída por um contador: o que se mede aqui é
      // QUANTAS vezes o dinheiro sairia, e não pode sair de verdade num teste.
      jest.spyOn(stripe, 'transferir').mockImplementation(async () => {
        transferencias += 1;
        return { id: `tr_${transferencias}` };
      });
    });

    afterEach(async () => {
      jest.restoreAllMocks();
      await prisma.affiliateEarning.deleteMany({ where: { affiliateId: afiliadoId } });
      await prisma.affiliateAccount.update({
        where: { id: afiliadoId },
        data: { availableBalance: 0, pendingBalance: 0 },
      });
    });

    // A PROPRIEDADE da fatia: dois eventos DIFERENTES do Stripe chegando juntos
    // (checkout.session.completed e invoice.payment_succeeded) para a mesma
    // fatura. A idempotência por event.id não os deduplica — quem deduplica é a
    // @@unique([invoiceId, affiliateId]), e só porque a reserva vem antes.
    it('mesma fatura por dois caminhos simultâneos ⇒ UMA transferência', async () => {
      const fatura = { id: `${TAG}-in-corrida`, amountPaid: 10000 };

      await Promise.all([
        comissoes.processar({ id: 'sub-e2e', offerId: ofertaId }, fatura),
        comissoes.processar({ id: 'sub-e2e', offerId: ofertaId }, fatura),
      ]);

      expect(transferencias).toBe(1);
      expect(
        await prisma.affiliateEarning.count({ where: { invoiceId: fatura.id } }),
      ).toBe(1);
    });

    it('cinco chamadas simultâneas ⇒ ainda UMA transferência e UMA linha', async () => {
      const fatura = { id: `${TAG}-in-cinco`, amountPaid: 10000 };

      await Promise.all(
        Array.from({ length: 5 }, () =>
          comissoes.processar({ id: 'sub-e2e', offerId: ofertaId }, fatura),
        ),
      );

      expect(transferencias).toBe(1);
      expect(await prisma.affiliateEarning.count({ where: { invoiceId: fatura.id } })).toBe(1);
    });

    // CONTROLE: faturas diferentes SÃO comissões diferentes. Sem isto, um
    // serviço que nunca transferisse passaria nos dois testes acima.
    it('[controle] faturas diferentes ⇒ duas transferências e duas linhas', async () => {
      await comissoes.processar({ id: 'sub-e2e', offerId: ofertaId }, {
        id: `${TAG}-in-a`,
        amountPaid: 10000,
      });
      await comissoes.processar({ id: 'sub-e2e', offerId: ofertaId }, {
        id: `${TAG}-in-b`,
        amountPaid: 10000,
      });

      expect(transferencias).toBe(2);
      expect(await prisma.affiliateEarning.count({ where: { affiliateId: afiliadoId } })).toBe(2);
    });

    it('o saldo do afiliado é creditado uma vez só', async () => {
      const fatura = { id: `${TAG}-in-saldo`, amountPaid: 10000 };

      await Promise.all(
        Array.from({ length: 4 }, () =>
          comissoes.processar({ id: 'sub-e2e', offerId: ofertaId }, fatura),
        ),
      );

      const conta = await prisma.affiliateAccount.findUnique({ where: { id: afiliadoId } });
      // 100 reais × 10% = 1000 centavos, uma vez.
      expect(conta!.availableBalance).toBe(1000);
    });

    it('transferência falha ⇒ comissão fica pendente, não some', async () => {
      jest.spyOn(stripe, 'transferir').mockRejectedValue(new Error('conta restrita'));
      const fatura = { id: `${TAG}-in-falha`, amountPaid: 10000 };

      const r = await comissoes.processar({ id: 'sub-e2e', offerId: ofertaId }, fatura);

      expect(r).toEqual(expect.objectContaining({ status: 'pending' }));

      const linha = await prisma.affiliateEarning.findFirst({ where: { invoiceId: fatura.id } });
      expect(linha!.status).toBe('pending');
      expect(linha!.earnedAmount).toBe(1000);

      const conta = await prisma.affiliateAccount.findUnique({ where: { id: afiliadoId } });
      expect(conta!.pendingBalance).toBe(1000);
      expect(conta!.availableBalance).toBe(0);
    });

    // Nenhuma linha pode ficar em `reserving`: ela é estado intermediário, e
    // linha parada nele significa processo morto no meio.
    it('nenhuma comissão fica presa em reserving', async () => {
      const fatura = { id: `${TAG}-in-reserving`, amountPaid: 10000 };

      await comissoes.processar({ id: 'sub-e2e', offerId: ofertaId }, fatura);

      const presas = await prisma.affiliateEarning.count({
        where: { affiliateId: afiliadoId, status: 'reserving' },
      });
      expect(presas).toBe(0);
    });
  });
});
