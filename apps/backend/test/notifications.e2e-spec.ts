import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { encode } from 'next-auth/jwt';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma/prisma.service';

const SECRET = 'e2e-secret-nao-usado-em-producao';
const TAG = 'e2e-notif';

function mint(claims: Record<string, unknown>): Promise<string> {
  return encode({ token: claims, secret: SECRET });
}

/**
 * Posse é a propriedade desta fatia, e ela só é provável contra o banco: com
 * Prisma mockado, quem rejeita o acesso alheio é o mock, não a consulta.
 * Por isso aqui existem DOIS usuários reais, cada um com sua sessão.
 */
describe('/notifications (e2e, Postgres real)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let userA: string;
  let userB: string;
  let tokenA: string;
  let tokenB: string;

  const createdUserIds = new Set<string>();

  async function makeNotification(userId: string, overrides: Partial<{
    title: string;
    isRead: boolean;
    createdAt: Date;
  }> = {}) {
    return prisma.notification.create({
      data: {
        userId,
        type: 'SYSTEM',
        title: overrides.title ?? `${TAG} título`,
        message: `${TAG} mensagem`,
        isRead: overrides.isRead ?? false,
        ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
      },
    });
  }

  beforeAll(async () => {
    process.env.NEXTAUTH_SECRET = SECRET;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const a = await prisma.user.create({
      data: { email: `${TAG}-a@example.com`, name: 'Usuário A' },
    });
    const b = await prisma.user.create({
      data: { email: `${TAG}-b@example.com`, name: 'Usuário B' },
    });
    userA = a.id;
    userB = b.id;
    createdUserIds.add(userA);
    createdUserIds.add(userB);

    tokenA = await mint({ id: userA, email: a.email, roles: ['INDIVIDUAL'], systemRoles: ['USER'] });
    tokenB = await mint({ id: userB, email: b.email, roles: ['INDIVIDUAL'], systemRoles: ['USER'] });
  });

  afterAll(async () => {
    // Notification tem onDelete: Cascade em User, mas apagar explicitamente
    // deixa o cleanup independente do schema.
    await prisma.notification.deleteMany({ where: { userId: { in: [...createdUserIds] } } });
    await prisma.user.deleteMany({ where: { id: { in: [...createdUserIds] } } });
    await app?.close();
  });

  const asA = () => ({ Authorization: `Bearer ${tokenA}` });
  const asB = () => ({ Authorization: `Bearer ${tokenB}` });

  describe('autenticação (propriedades 1 e 2)', () => {
    it('GET sem sessão → 401', async () => {
      const res = await request(app.getHttpServer()).get('/notifications');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Não autorizado' });
    });

    it('PATCH sem sessão → 401', async () => {
      const res = await request(app.getHttpServer()).patch('/notifications/qualquer/read');
      expect(res.status).toBe(401);
    });
  });

  describe('posse na leitura (propriedades 3 e 4)', () => {
    it('A não vê notificação de B, e o unreadCount não a conta', async () => {
      const daA = await makeNotification(userA, { title: `${TAG} da A` });
      const daB = await makeNotification(userB, { title: `${TAG} da B` });

      const res = await request(app.getHttpServer()).get('/notifications').set(asA());

      expect(res.status).toBe(200);
      const ids = res.body.notifications.map((n: { id: string }) => n.id);
      expect(ids).toContain(daA.id);
      expect(ids).not.toContain(daB.id);
      expect(res.body.unreadCount).toBe(1);

      // E o inverso, para não passar por acidente de fixture.
      const resB = await request(app.getHttpServer()).get('/notifications').set(asB());
      const idsB = resB.body.notifications.map((n: { id: string }) => n.id);
      expect(idsB).toContain(daB.id);
      expect(idsB).not.toContain(daA.id);

      await prisma.notification.deleteMany({ where: { id: { in: [daA.id, daB.id] } } });
    });

    it('já lida não entra no unreadCount', async () => {
      const naoLida = await makeNotification(userA);
      const lida = await makeNotification(userA, { isRead: true });

      const res = await request(app.getHttpServer()).get('/notifications').set(asA());
      expect(res.body.unreadCount).toBe(1);
      expect(res.body.notifications).toHaveLength(2);

      await prisma.notification.deleteMany({ where: { id: { in: [naoLida.id, lida.id] } } });
    });
  });

  describe('posse na escrita (propriedades 5–8) — o IDOR', () => {
    it('A não consegue marcar como lida a notificação de B, e ela não muda', async () => {
      const daB = await makeNotification(userB);

      const res = await request(app.getHttpServer())
        .patch(`/notifications/${daB.id}/read`)
        .set(asA());

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Notificação não encontrada' });

      // O que realmente importa: a linha do outro continua intacta no banco.
      const intacta = await prisma.notification.findUnique({ where: { id: daB.id } });
      expect(intacta!.isRead).toBe(false);

      await prisma.notification.delete({ where: { id: daB.id } });
    });

    // Propriedade 6 — a indistinguibilidade é a propriedade.
    it('id de outro e id inexistente devolvem resposta idêntica', async () => {
      const daB = await makeNotification(userB);

      const doOutro = await request(app.getHttpServer())
        .patch(`/notifications/${daB.id}/read`)
        .set(asA());
      const inexistente = await request(app.getHttpServer())
        .patch('/notifications/nao-existe-mesmo/read')
        .set(asA());

      expect(doOutro.status).toBe(inexistente.status);
      expect(doOutro.body).toEqual(inexistente.body);

      await prisma.notification.delete({ where: { id: daB.id } });
    });

    it('B marca a própria como lida', async () => {
      const daB = await makeNotification(userB);

      const res = await request(app.getHttpServer())
        .patch(`/notifications/${daB.id}/read`)
        .set(asB());

      expect(res.status).toBe(200);
      expect(res.body.isRead).toBe(true);

      const noBanco = await prisma.notification.findUnique({ where: { id: daB.id } });
      expect(noBanco!.isRead).toBe(true);

      await prisma.notification.delete({ where: { id: daB.id } });
    });

    it('marcar já lida é idempotente', async () => {
      const daA = await makeNotification(userA, { isRead: true });

      const res = await request(app.getHttpServer())
        .patch(`/notifications/${daA.id}/read`)
        .set(asA());

      expect(res.status).toBe(200);
      expect(res.body.isRead).toBe(true);

      await prisma.notification.delete({ where: { id: daA.id } });
    });
  });

  describe('paginação (propriedades 9–16)', () => {
    const criadas: string[] = [];

    beforeAll(async () => {
      // 5 notificações com createdAt distinto e crescente.
      for (let i = 0; i < 5; i++) {
        const n = await makeNotification(userA, {
          title: `${TAG} pag ${i}`,
          createdAt: new Date(Date.UTC(2026, 0, i + 1, 12, 0, 0)),
        });
        criadas.push(n.id);
      }
    });

    afterAll(async () => {
      await prisma.notification.deleteMany({ where: { id: { in: criadas } } });
    });

    it('ordena da mais recente para a mais antiga', async () => {
      const res = await request(app.getHttpServer()).get('/notifications').set(asA());
      const datas = res.body.notifications.map((n: { createdAt: string }) =>
        new Date(n.createdAt).getTime(),
      );
      expect([...datas]).toEqual([...datas].sort((x, y) => y - x));
    });

    it('respeita o limit e devolve nextCursor quando a página enche', async () => {
      const res = await request(app.getHttpServer()).get('/notifications?limit=2').set(asA());

      expect(res.body.notifications).toHaveLength(2);
      expect(res.body.nextCursor).toBe(
        new Date(res.body.notifications[1].createdAt).toISOString(),
      );
    });

    it('limit acima do teto é clampado em 50', async () => {
      const res = await request(app.getHttpServer()).get('/notifications?limit=999').set(asA());
      expect(res.status).toBe(200);
      expect(res.body.notifications.length).toBeLessThanOrEqual(50);
    });

    // Propriedade 16 — o que o BUG-65 quebrava: página seguinte pulando ou
    // repetindo linha. Só aparece contra dados reais ordenados.
    it('páginas consecutivas não pulam nem repetem linha', async () => {
      const p1 = await request(app.getHttpServer()).get('/notifications?limit=2').set(asA());
      const p2 = await request(app.getHttpServer())
        .get(`/notifications?limit=2&cursor=${encodeURIComponent(p1.body.nextCursor)}`)
        .set(asA());
      const p3 = await request(app.getHttpServer())
        .get(`/notifications?limit=2&cursor=${encodeURIComponent(p2.body.nextCursor)}`)
        .set(asA());

      const ids = [
        ...p1.body.notifications,
        ...p2.body.notifications,
        ...p3.body.notifications,
      ].map((n: { id: string }) => n.id);

      expect(new Set(ids).size).toBe(ids.length); // sem repetição
      expect(ids).toHaveLength(5); // sem pulo: as 5 criadas
      expect([...ids].sort()).toEqual([...criadas].sort());
    });

    it('última página vem incompleta e com nextCursor null', async () => {
      const res = await request(app.getHttpServer()).get('/notifications?limit=10').set(asA());
      expect(res.body.notifications).toHaveLength(5);
      expect(res.body.nextCursor).toBeNull();
    });

    // Propriedade 15 — o que o BUG-108 quebrava: 500 do Prisma.
    it('cursor inválido → 400, não 500', async () => {
      const res = await request(app.getHttpServer())
        .get('/notifications?cursor=ontem')
        .set(asA());

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/ISO 8601/);
    });
  });
});
