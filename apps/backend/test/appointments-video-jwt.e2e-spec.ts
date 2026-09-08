import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { encode } from 'next-auth/jwt';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma/prisma.service';

const SECRET = 'e2e-secret-nao-usado-em-producao';
const TAG = 'e2e-video38';

function decodificarSemVerificar(token: string): Record<string, unknown> {
  const [, payload] = token.split('.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
}

/**
 * Fatia 38 — RED. JWT do Jitsi (mint ainda não existe).
 *
 * Padrão da casa (A55): 403 do intruso vai PAREADO com 200 legítimo —
 * sem o par positivo, "endpoint ausente" e "posse negada" são iguais.
 */
describe('/appointments/:id/video com JWT (e2e, Postgres real)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let prof: string;
  let atleta: string;
  let tokenProf: string;
  let tokenAtleta: string;
  let tokenIntruso: string;
  let apt: string;
  const usuarios = new Set<string>();

  const mint = (claims: Record<string, unknown>) => encode({ token: claims, secret: SECRET });

  beforeAll(async () => {
    process.env.NEXTAUTH_SECRET = SECRET;
    delete process.env.DAILY_API_KEY;
    process.env.VIDEO_PROVIDER = 'jitsi';
    process.env.JITSI_DOMAIN = 'meet.exemplo-e2e.com';
    process.env.JITSI_APP_ID = 'trainlab';
    process.env.JITSI_JWT_SECRET = 'segredo-e2e';

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
    tokenProf = await mint({ id: prof, email: p.email, roles: ['PROFESSIONAL'], systemRoles: ['USER'] });
    tokenAtleta = await mint({ id: atleta, email: a.email, roles: ['CLIENT'], systemRoles: ['USER'] });
    tokenIntruso = await mint({ id: i.id, email: i.email, roles: ['CLIENT'], systemRoles: ['USER'] });

    await prisma.trainerAthlete.create({ data: { trainerId: prof, athleteId: atleta } });
    const created = await prisma.appointment.create({
      data: {
        trainerId: prof,
        athleteId: atleta,
        title: `${TAG} aula`,
        scheduledAt: new Date('2099-06-01T10:00:00Z'),
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
    delete process.env.JITSI_JWT_SECRET;
    delete process.env.JITSI_DOMAIN;
    delete process.env.JITSI_APP_ID;
    delete process.env.VIDEO_PROVIDER;
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  it('treinador recebe token moderator:true; aluno recebe moderator:false', async () => {
    await http().post(`/appointments/${apt}/video`).set('Authorization', `Bearer ${tokenProf}`).send({});

    const comoProf = await http().get(`/appointments/${apt}/video`).set('Authorization', `Bearer ${tokenProf}`);
    expect(comoProf.status).toBe(200);
    expect(typeof comoProf.body.token).toBe('string');
    expect(decodificarSemVerificar(comoProf.body.token)).toMatchObject({
      room: comoProf.body.roomName,
      context: { user: { moderator: true } },
    });

    const comoAtleta = await http().get(`/appointments/${apt}/video`).set('Authorization', `Bearer ${tokenAtleta}`);
    expect(comoAtleta.status).toBe(200);
    expect(typeof comoAtleta.body.token).toBe('string');
    expect(decodificarSemVerificar(comoAtleta.body.token)).toMatchObject({
      context: { user: { moderator: false } },
    });
  });

  it('intruso recebe 403 (par positivo acima prova que a rota existe)', async () => {
    const res = await http().get(`/appointments/${apt}/video`).set('Authorization', `Bearer ${tokenIntruso}`);
    expect(res.status).toBe(403);
    expect(res.body).not.toHaveProperty('token');
  });
});
