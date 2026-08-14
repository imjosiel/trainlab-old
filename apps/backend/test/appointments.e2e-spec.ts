import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { encode } from 'next-auth/jwt';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma/prisma.service';

const SECRET = 'e2e-secret-nao-usado-em-producao';
const TAG = 'e2e-apt';

function mint(claims: Record<string, unknown>): Promise<string> {
  return encode({ token: claims, secret: SECRET });
}

/**
 * Fatia 13 — agendamentos. Spec: docs/implementation-plans/epic-nest-agendamentos.md
 *
 * TODA asserção de 404/403 aqui vai PAREADA com um caso legítimo exigindo 200.
 * Não é zelo: no red da fatia 12, os cinco e2e que afirmavam só 404 passaram —
 * porque nenhuma rota existia e o Nest responde 404 a caminho desconhecido
 * (A55). Sem o par positivo, "posse negada" e "endpoint ausente" são a mesma
 * resposta.
 */
describe('/appointments (e2e, Postgres real)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  /** ['PROFESSIONAL','CLIENT'] — o estado que o A57 deixa meio invisível. */
  let duplo: string;
  let outroProf: string;
  let terceiro: string;

  let tokenDuplo: string;
  let tokenOutroProf: string;

  /** duplo MARCOU (é o profissional) — o legado enxerga. */
  let marquei: string;
  /** marcaram PARA duplo, como atleta — o legado NÃO enxerga. */
  let marcaramParaMim: string;
  /** entre terceiros. */
  let alheio: string;

  const usuarios = new Set<string>();

  beforeAll(async () => {
    process.env.NEXTAUTH_SECRET = SECRET;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const criar = async (sufixo: string, roles: string[]) => {
      const u = await prisma.user.create({
        data: { email: `${TAG}-${sufixo}@example.com`, name: `Usuário ${sufixo}`, roles: roles as never },
      });
      usuarios.add(u.id);
      return u;
    };

    const d = await criar('duplo', ['PROFESSIONAL', 'CLIENT']);
    const o = await criar('outroprof', ['PROFESSIONAL']);
    const t = await criar('terceiro', ['CLIENT']);
    duplo = d.id;
    outroProf = o.id;
    terceiro = t.id;

    tokenDuplo = await mint({ id: duplo, email: d.email, roles: ['PROFESSIONAL', 'CLIENT'], systemRoles: ['USER'] });
    tokenOutroProf = await mint({ id: outroProf, email: o.email, roles: ['PROFESSIONAL'], systemRoles: ['USER'] });

    // Vínculo, para o profissional poder marcar para o atleta.
    await prisma.trainerAthlete.create({ data: { trainerId: duplo, athleteId: terceiro } });

    const a1 = await prisma.appointment.create({
      data: { trainerId: duplo, athleteId: terceiro, title: `${TAG} eu marquei`, scheduledAt: new Date('2099-03-01T10:00:00Z') },
    });
    const a2 = await prisma.appointment.create({
      data: { trainerId: outroProf, athleteId: duplo, title: `${TAG} marcaram pra mim`, scheduledAt: new Date('2099-03-02T10:00:00Z') },
    });
    const a3 = await prisma.appointment.create({
      data: { trainerId: outroProf, athleteId: terceiro, title: `${TAG} alheio`, scheduledAt: new Date('2099-03-03T10:00:00Z') },
    });
    marquei = a1.id;
    marcaramParaMim = a2.id;
    alheio = a3.id;
  });

  afterAll(async () => {
    const ids = [...usuarios];
    await prisma.appointment.deleteMany({
      where: { OR: [{ trainerId: { in: ids } }, { athleteId: { in: ids } }] },
    });
    await prisma.trainerAthlete.deleteMany({ where: { trainerId: { in: ids } } });
    await prisma.blockedSlot.deleteMany({ where: { config: { trainerId: { in: ids } } } });
    await prisma.trainerScheduleConfig.deleteMany({ where: { trainerId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app?.close();
  });

  const comoDuplo = () => ({ Authorization: `Bearer ${tokenDuplo}` });
  const comoOutroProf = () => ({ Authorization: `Bearer ${tokenOutroProf}` });
  const http = () => request(app.getHttpServer());

  /* ────────────────────────────────────────────────────────────────────────── */

  describe('autenticação', () => {
    it('GET /appointments sem sessão → 401', async () => {
      const res = await http().get('/appointments');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Não autorizado' });
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * A57 — o coração desta fatia
   * ────────────────────────────────────────────────────────────────────────── */

  describe('A57 — agenda de quem tem PROFESSIONAL e CLIENT', () => {
    it('traz o que ele marcou', async () => {
      const res = await http().get('/appointments').set(comoDuplo());
      expect(res.status).toBe(200);
      const ids = res.body.appointments.map((a: { id: string }) => a.id);
      expect(ids).toContain(marquei);
    });

    // A que o legado reprova. Medida ao vivo contra o monolito antes desta fatia:
    // "vê o que MARCARAM PARA ELE (é o atleta): false".
    it('traz o que MARCARAM PARA ELE', async () => {
      const res = await http().get('/appointments').set(comoDuplo());
      const ids = res.body.appointments.map((a: { id: string }) => a.id);
      expect(ids).toContain(marcaramParaMim);
    });

    it('NÃO traz agendamento entre terceiros', async () => {
      const res = await http().get('/appointments').set(comoDuplo());
      const ids = res.body.appointments.map((a: { id: string }) => a.id);
      expect(ids).not.toContain(alheio);
    });

    it('o total bate com o que foi devolvido', async () => {
      const res = await http().get('/appointments').set(comoDuplo());
      expect(res.body.total).toBe(res.body.appointments.length);
    });

    it('quem tem um papel só continua vendo o que via — paridade', async () => {
      const res = await http().get('/appointments').set(comoOutroProf());
      const ids = res.body.appointments.map((a: { id: string }) => a.id);
      expect(ids).toEqual(expect.arrayContaining([marcaramParaMim, alheio]));
      expect(ids).not.toContain(marquei);
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * Posse — cada negativa pareada com uma positiva (A55)
   * ────────────────────────────────────────────────────────────────────────── */

  describe('posse', () => {
    it('PATCH: no meu → 200, no alheio → 403/404', async () => {
      const meu = await http().patch(`/appointments/${marcaramParaMim}`).set(comoDuplo()).send({ status: 'CONFIRMED' });
      const outro = await http().patch(`/appointments/${alheio}`).set(comoDuplo()).send({ status: 'CANCELED' });

      expect(meu.status).toBe(200);
      expect([403, 404]).toContain(outro.status);
    });

    it('DELETE: no que eu marquei → 200, no alheio → 403/404 e nada apagado', async () => {
      const descartavel = await prisma.appointment.create({
        data: { trainerId: duplo, athleteId: terceiro, title: `${TAG} descartável`, scheduledAt: new Date('2099-04-01T10:00:00Z') },
      });

      const alheioRes = await http().delete(`/appointments/${alheio}`).set(comoDuplo());
      const meuRes = await http().delete(`/appointments/${descartavel.id}`).set(comoDuplo());

      expect(meuRes.status).toBe(200);
      expect([403, 404]).toContain(alheioRes.status);
      expect(await prisma.appointment.count({ where: { id: alheio } })).toBe(1);
      expect(await prisma.appointment.count({ where: { id: descartavel.id } })).toBe(0);
    });

    it('atendido NÃO apaga, mas o profissional apaga', async () => {
      const doOutro = await prisma.appointment.create({
        data: { trainerId: outroProf, athleteId: duplo, title: `${TAG} do outro`, scheduledAt: new Date('2099-04-02T10:00:00Z') },
      });

      const comoAtendido = await http().delete(`/appointments/${doOutro.id}`).set(comoDuplo());
      const comoDono = await http().delete(`/appointments/${doOutro.id}`).set(comoOutroProf());

      expect(comoAtendido.status).toBe(403);
      expect(comoDono.status).toBe(200);
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * Link mágico
   * ────────────────────────────────────────────────────────────────────────── */

  describe('link de confirmação (D67/D68)', () => {
    async function comLink() {
      const apt = await prisma.appointment.create({
        data: { trainerId: duplo, athleteId: terceiro, title: `${TAG} com link`, scheduledAt: new Date('2099-05-01T10:00:00Z') },
      });
      const res = await http().patch(`/appointments/${apt.id}`).set(comoDuplo()).send({ action: 'generate-link' });
      const token = (await prisma.appointment.findUnique({ where: { id: apt.id }, select: { confirmToken: true } }))?.confirmToken;
      return { apt, res, token };
    }

    it('gera link e devolve a URL de confirmação', async () => {
      const { res, token } = await comLink();
      expect(res.status).toBe(200);
      expect(res.body.confirmUrl).toContain(token);
    });

    it('a rota pública responde SEM sessão e não devolve o token', async () => {
      const { token } = await comLink();

      const res = await http().get(`/appointments/confirm/${token}`);

      expect(res.status).toBe(200);
      expect(res.body.appointment).not.toHaveProperty('confirmToken');
      expect(res.body.appointment.title).toContain(TAG);
    });

    it('token inexistente → 404, e o válido → 200', async () => {
      const { token } = await comLink();

      const bom = await http().get(`/appointments/confirm/${token}`);
      const ruim = await http().get('/appointments/confirm/nao-existe');

      expect(bom.status).toBe(200);
      expect(ruim.status).toBe(404);
    });

    it('confirmar muda o status e anula o token', async () => {
      const { apt, token } = await comLink();

      const res = await http().post(`/appointments/confirm/${token}`).send({ action: 'confirm' });
      expect(res.status).toBe(200);

      const depois = await prisma.appointment.findUnique({ where: { id: apt.id } });
      expect(depois!.status).toBe('CONFIRMED');
      expect(depois!.confirmToken).toBeNull();
      expect(depois!.confirmedAt).not.toBeNull();
    });

    // A corrida do A62. No legado o segundo update estoura P2025 e vira 500.
    it('duas confirmações simultâneas: uma 200, outra 409, nenhuma 500', async () => {
      const { token } = await comLink();

      const [a, b] = await Promise.all([
        http().post(`/appointments/confirm/${token}`).send({ action: 'confirm' }),
        http().post(`/appointments/confirm/${token}`).send({ action: 'confirm' }),
      ]);

      const status = [a.status, b.status].sort();
      expect(status).toEqual([200, 409]);
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * A58 — expediente
   * ────────────────────────────────────────────────────────────────────────── */

  describe('schedule-config (D65, corrige A58)', () => {
    it('GET cria a config padrão na primeira visita', async () => {
      const res = await http().get('/trainer/schedule-config').set(comoDuplo());
      expect(res.status).toBe(200);
      expect(res.body.config).toEqual(
        expect.objectContaining({ workStartHour: 7, workEndHour: 22, workDays: [1, 2, 3, 4, 5] }),
      );
    });

    // O caso medido no monolito: HTTP 200 e o banco gravando 0.
    it('workStartHour="" → 400 e o banco NÃO muda', async () => {
      await http().get('/trainer/schedule-config').set(comoDuplo());
      const antes = await prisma.trainerScheduleConfig.findUnique({ where: { trainerId: duplo } });

      const res = await http().patch('/trainer/schedule-config').set(comoDuplo()).send({ workStartHour: '' });

      const depois = await prisma.trainerScheduleConfig.findUnique({ where: { trainerId: duplo } });
      expect(res.status).toBe(400);
      expect(depois!.workStartHour).toBe(antes!.workStartHour);
    });

    it('workStartHour="abc" → 400, não 500', async () => {
      const res = await http().patch('/trainer/schedule-config').set(comoDuplo()).send({ workStartHour: 'abc' });
      expect(res.status).toBe(400);
    });

    // CONTROLE: sem ele, um PATCH que rejeitasse tudo passaria nos dois acima.
    it('[controle] valor inteiro válido → 200 e o banco muda', async () => {
      const res = await http().patch('/trainer/schedule-config').set(comoDuplo()).send({ workStartHour: 9 });

      expect(res.status).toBe(200);
      const depois = await prisma.trainerScheduleConfig.findUnique({ where: { trainerId: duplo } });
      expect(depois!.workStartHour).toBe(9);
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * Criação
   * ────────────────────────────────────────────────────────────────────────── */

  describe('criação', () => {
    it('profissional cria para o atleta vinculado, e o atleta é notificado (D70)', async () => {
      const antes = await prisma.notification.count({ where: { userId: terceiro } });

      const res = await http()
        .post('/appointments')
        .set(comoDuplo())
        .send({ title: `${TAG} nova sessão`, scheduledAt: '2099-06-01T10:00:00.000Z', athleteId: terceiro });

      expect(res.status).toBe(201);
      expect(res.body.appointment.title).toBe(`${TAG} nova sessão`);

      const depois = await prisma.notification.count({ where: { userId: terceiro } });
      expect(depois).toBe(antes + 1);
    });

    it('atleta sem vínculo → 403 e nada criado', async () => {
      const antes = await prisma.appointment.count();

      const res = await http()
        .post('/appointments')
        .set(comoDuplo())
        .send({ title: `${TAG} invasão`, scheduledAt: '2099-06-02T10:00:00.000Z', athleteId: outroProf });

      expect(res.status).toBe(403);
      expect(await prisma.appointment.count()).toBe(antes);
    });

    it('scheduledAt inválido → 400, não 500', async () => {
      const res = await http()
        .post('/appointments')
        .set(comoDuplo())
        .send({ title: 'x', scheduledAt: 'ontem', athleteId: terceiro });
      expect(res.status).toBe(400);
    });
  });
});
