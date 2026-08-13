import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { encode } from 'next-auth/jwt';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma/prisma.service';

const SECRET = 'e2e-secret-nao-usado-em-producao';
const TAG = 'e2e-my-trainers';

function mint(claims: Record<string, unknown>): Promise<string> {
  return encode({ token: claims, secret: SECRET });
}

describe('GET /users/my-trainers (e2e, Postgres real)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let studentA: string;
  let studentB: string;
  let trainerA: string;
  let trainerB: string;
  let tokenA: string;

  const createdUserIds = new Set<string>();

  beforeAll(async () => {
    process.env.NEXTAUTH_SECRET = SECRET;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const [a, b, ta, tb] = await Promise.all([
      prisma.user.create({ data: { email: `${TAG}-student-a@example.com`, name: 'Aluno A' } }),
      prisma.user.create({ data: { email: `${TAG}-student-b@example.com`, name: 'Aluno B' } }),
      prisma.user.create({ data: { email: `${TAG}-trainer-a@example.com`, name: 'Treinador A', image: 'https://example.com/a.png' } }),
      prisma.user.create({ data: { email: `${TAG}-trainer-b@example.com`, name: 'Treinador B' } }),
    ]);

    studentA = a.id;
    studentB = b.id;
    trainerA = ta.id;
    trainerB = tb.id;
    [a, b, ta, tb].forEach((user) => createdUserIds.add(user.id));

    // Duas fichas para o mesmo treinador devem aparecer como um único contato.
    await prisma.student.createMany({
      data: [
        { name: 'Ficha A1', trainerId: trainerA, userId: studentA },
        { name: 'Ficha A2', trainerId: trainerA, userId: studentA },
        { name: 'Ficha B1', trainerId: trainerB, userId: studentB },
      ],
    });

    tokenA = await mint({ id: studentA, email: a.email, roles: ['CLIENT'], systemRoles: ['USER'] });
  });

  afterAll(async () => {
    await prisma.student.deleteMany({ where: { userId: { in: [...createdUserIds] } } });
    await prisma.user.deleteMany({ where: { id: { in: [...createdUserIds] } } });
    await app?.close();
  });

  it('sem sessão responde 401', async () => {
    const res = await request(app.getHttpServer()).get('/users/my-trainers');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Não autorizado' });
  });

  it('mostra somente os treinadores vinculados ao aluno da sessão, sem duplicar', async () => {
    const res = await request(app.getHttpServer())
      .get('/users/my-trainers')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      trainers: [
        {
          id: trainerA,
          name: 'Treinador A',
          image: 'https://example.com/a.png',
          email: `${TAG}-trainer-a@example.com`,
        },
      ],
    });
    expect(JSON.stringify(res.body)).not.toContain(trainerB);
  });

  it('aluno sem vínculo recebe lista vazia', async () => {
    const semVinculo = await prisma.user.create({
      data: { email: `${TAG}-sem-vinculo@example.com`, name: 'Sem vínculo' },
    });
    createdUserIds.add(semVinculo.id);
    const token = await mint({ id: semVinculo.id, roles: ['CLIENT'], systemRoles: ['USER'] });

    const res = await request(app.getHttpServer())
      .get('/users/my-trainers')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ trainers: [] });
  });
});
