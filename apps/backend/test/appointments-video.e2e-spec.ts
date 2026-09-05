import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { encode } from 'next-auth/jwt';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma/prisma.service';

const SECRET = 'e2e-secret-nao-usado-em-producao';
const TAG = 'e2e-video37';

/**
 * Fatia 37 — RED. Vídeo 1:1 (rotas ainda não existem).
 *
 * Padrão da casa (A55): toda asserção de 404/403 vai PAREADA com caso legítimo
 * 200 — sem o par positivo, "endpoint ausente" e "posse negada" dão a mesma
 * resposta e o teste passa sem exercitar nada.
 */
describe('/appointments/:id/video (e2e, Postgres real)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let prof: string;
  let atleta: string;
  let intruso: string;
  let tokenProf: string;
  let tokenIntruso: string;
  let apt: string;
  const usuarios = new Set<string>();

  const mint = (claims: Record<string, unknown>) => encode({ token: claims, secret: SECRET });

  beforeAll(async () => {
    process.env.NEXTAUTH_SECRET = SECRET;
    delete process.env.DAILY_API_KEY;

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

    const p = await criar('prof', ['PROFESSIONAL']);
    const a = await criar('atleta', ['CLIENT']);
    const i = await criar('intruso', ['CLIENT']);
    prof = p.id;
    atleta = a.id;
    intruso = i.id;
    tokenProf = await mint({ id: prof, email: p.email, roles: ['PROFESSIONAL'], systemRoles: ['USER'] });
    tokenIntruso = await mint({ id: intruso, email: i.email, roles: ['CLIENT'], systemRoles: ['USER'] });

    await prisma.trainerAthlete.create({ data: { trainerId: prof, athleteId: atleta } });
    const created = await prisma.appointment.create({
      data: {
        trainerId: prof,
        athleteId: atleta,
        title: `${TAG} aula`,
        scheduledAt: new Date('2099-04-01T10:00:00Z'),
      },
    });
    apt = created.id;
  });

  afterAll(async () => {
    const ids = [...usuarios];
    await prisma.appointment.deleteMany({
      where: { OR: [{ trainerId: { in: ids } }, { athleteId: { in: ids } }] },
    });
    await prisma.trainerAthlete.deleteMany({ where: { trainerId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  it('participante cria sala (200 com joinUrl) e segunda chamada é idempotente', async () => {
    const primeira = await http()
      .post(`/appointments/${apt}/video`)
      .set('Authorization', `Bearer ${tokenProf}`)
      .send({});
    expect(primeira.status).toBe(200);
    expect(primeira.body.video?.joinUrl).toEqual(expect.stringContaining('https://'));

    const segunda = await http()
      .post(`/appointments/${apt}/video`)
      .set('Authorization', `Bearer ${tokenProf}`)
      .send({});
    expect(segunda.status).toBe(200);
    expect(segunda.body.video?.roomName).toBe(primeira.body.video?.roomName);
  });

  it('participante lê a sala; intruso recebe 403 nos dois verbos', async () => {
    const leitura = await http()
      .get(`/appointments/${apt}/video`)
      .set('Authorization', `Bearer ${tokenProf}`);
    expect(leitura.status).toBe(200);
    expect(leitura.body).toMatchObject({ provider: expect.any(String) });

    const criaIntruso = await http()
      .post(`/appointments/${apt}/video`)
      .set('Authorization', `Bearer ${tokenIntruso}`)
      .send({});
    expect(criaIntruso.status).toBe(403);

    const leIntruso = await http()
      .get(`/appointments/${apt}/video`)
      .set('Authorization', `Bearer ${tokenIntruso}`);
    expect(leIntruso.status).toBe(403);
  });
});
