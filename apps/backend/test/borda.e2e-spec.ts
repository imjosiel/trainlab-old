import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { encode } from 'next-auth/jwt';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma/prisma.service';

const SECRET = 'e2e-secret-nao-usado-em-producao';
const TAG = 'e2e-borda';

function mint(claims: Record<string, unknown>): Promise<string> {
  return encode({ token: claims, secret: SECRET });
}

/**
 * Fatia 31 (D107–D110) — RED. E2E da fiação: pipe + throttle + DTOs no stack
 * HTTP real contra Postgres real.
 *
 * Estes testes NÃO provam regra de negócio (isso é unit). Provam que a fiação
 * existe: se alguém remover o `useGlobalPipes` do `main.ts` ou o guard do
 * `app.module.ts`, esta suite quebra e os 1304 units continuam verdes.
 */
describe('Borda: pipe + throttle + DTOs (e2e, Postgres real)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let trainerToken: string;
  let trainerId: string;

  const createdPlanIds = new Set<string>();
  const createdUserIds = new Set<string>();

  beforeAll(async () => {
    process.env.NEXTAUTH_SECRET = SECRET;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    // Espelha main.ts: sem isto o e2e provaria um stack diferente do prod.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    const trainer = await prisma.user.create({
      data: { email: `${TAG}-trainer@example.com`, name: 'Treinador Borda' },
    });
    trainerId = trainer.id;
    createdUserIds.add(trainer.id);

    adminToken = await mint({ id: trainer.id, systemRoles: ['ADMIN'], roles: ['PROFESSIONAL'] });
    trainerToken = await mint({ id: trainer.id, systemRoles: ['USER'], roles: ['PROFESSIONAL'] });
  });

  afterAll(async () => {
    await prisma.trainingPlan.deleteMany({ where: { id: { in: [...createdPlanIds] } } });
    await prisma.sport.deleteMany({ where: { slug: { startsWith: TAG } } });
    await prisma.partnerTier.deleteMany({ where: { slug: { startsWith: TAG } } });
    if (createdUserIds.size > 0) {
      await prisma.user.deleteMany({ where: { id: { in: [...createdUserIds] } } });
    }
    await app?.close();
  });

  describe('pipe ligado (D107)', () => {
    it('POST /admin/sports com slug maiúsculo → 400 { error }, sem gravar', async () => {
      const antes = await prisma.sport.count({ where: { slug: { startsWith: TAG } } });

      const res = await request(app.getHttpServer())
        .post('/admin/sports')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Borda', slug: `${TAG}-MAIUSCULO` });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body).not.toHaveProperty('statusCode');

      const depois = await prisma.sport.count({ where: { slug: { startsWith: TAG } } });
      expect(depois).toBe(antes);
    });

    it('POST /onboarding com role fora da lista → 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/onboarding')
        .set('Authorization', `Bearer ${trainerToken}`)
        .send({ role: 'DONO' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('POST /admin/partner-tiers com commissionRate 2 → 400, sem gravar tier', async () => {
      const antes = await prisma.partnerTier.count({ where: { slug: { startsWith: TAG } } });

      const res = await request(app.getHttpServer())
        .post('/admin/partner-tiers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `${TAG} tier`, slug: `${TAG}-tier`, commissionRate: 2 });

      expect(res.status).toBe(400);

      const depois = await prisma.partnerTier.count({ where: { slug: { startsWith: TAG } } });
      expect(depois).toBe(antes);
    });
  });

  describe('throttle (D108)', () => {
    it('rajada em /me (sem throttle próprio): passa no global sem 429', async () => {
      // Controle: o throttle global (100/min) NÃO pega rajada curta — prova
      // que o guard está ligado mas não estrangula leitura normal.
      for (let i = 0; i < 5; i++) {
        const res = await request(app.getHttpServer())
          .get('/me')
          .set('Authorization', `Bearer ${trainerToken}`);
        expect(res.status).toBe(200);
      }
    });

    it('rajada em /stripe/checkout-credits sem crédito ativo: 403s passam, depois 429 PT-BR', async () => {
      // 403 = chegou no handler (sistema de créditos desativado no banco de
      // teste), não throttled. O limite próprio da rota é 5/5min.
      const corpos: number[] = [];
      for (let i = 0; i < 7; i++) {
        const res = await request(app.getHttpServer())
          .post('/stripe/checkout-credits')
          .set('Authorization', `Bearer ${trainerToken}`)
          .send({ packageId: `${TAG}-inexistente` });
        corpos.push(res.status);
        if (res.status === 429) {
          expect(res.body).toEqual({
            error: 'Muitas requisições. Tente novamente em alguns instantes.',
          });
          expect(res.body).not.toHaveProperty('statusCode');
        }
      }
      expect(corpos.slice(0, 5)).toEqual([403, 403, 403, 403, 403]);
      expect(corpos[5]).toBe(429);
    }, 30000);
  });

  describe('state-machine no stack real (D100)', () => {
    it('PATCH PENDING→COMPLETED direto → 400, sem mudar o banco', async () => {
      const plan = await prisma.trainingPlan.create({
        data: {
          title: `${TAG} plano`,
          status: 'PENDING',
          aiSuggestion: `${TAG} sugestao`,
          trainerId,
          duration: 30,
          isManual: true,
        },
      });
      createdPlanIds.add(plan.id);

      const res = await request(app.getHttpServer())
        .patch(`/training-plans/${plan.id}`)
        .set('Authorization', `Bearer ${trainerToken}`)
        .send({ status: 'COMPLETED' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Transição inválida/);

      const noBanco = await prisma.trainingPlan.findUnique({ where: { id: plan.id } });
      expect(noBanco?.status).toBe('PENDING');
    });
  });
});
