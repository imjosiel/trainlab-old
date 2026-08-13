import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma/prisma.service';
import { NEVER_PUBLIC } from '@/users/public-profile.select';

const TAG = 'e2eperfil';

/**
 * Este e2e existe porque quem filtra campo é o `select` do Prisma, e mock ignora
 * `select`. E ele **grava anamnese de verdade** de propósito: testar com perfil
 * vazio provaria nada — o vazamento só aparece quando existe dado para vazar.
 */
describe('GET /users/public/:username (e2e, Postgres real)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const createdUserIds = new Set<string>();
  const createdProfileIds = new Set<string>();

  /** Valores sentinela: se qualquer um aparecer na resposta, vazou. */
  const SEGREDOS = {
    email: `${TAG}-privado@example.com`,
    phone: '+5511988887777',
    injuryHistory: 'SENTINELA ruptura de LCA em 2022',
    currentInjuries: 'SENTINELA tendinite no ombro',
    healthIssuesDesc: 'SENTINELA asma induzida por exercicio',
    medicationDesc: 'SENTINELA salbutamol 100mcg',
    goals: 'SENTINELA voltar a competir',
    weaknesses: 'SENTINELA medo de recair',
    strengths: 'SENTINELA explosao muscular',
  };

  async function makeUser(username: string, isPublic: boolean) {
    const sport = await prisma.sport.findFirst({ where: { isActive: true } });

    const user = await prisma.user.create({
      data: {
        email: `${TAG}-${username}@example.com`,
        name: 'Perfil E2E',
        username,
        bio: 'bio pública',
        isPublic,
        phone: SEGREDOS.phone,
        roles: ['INDIVIDUAL'],
        systemRoles: ['USER'],
      },
    });
    createdUserIds.add(user.id);

    const profile = await prisma.athleteProfile.create({
      data: {
        userId: user.id,
        sportId: sport!.id,
        position: 'Atacante',
        technicalLevel: 'avancado',
        yearsPlaying: 10,
        dominantFoot: 'direito',
        dateOfBirth: new Date('1995-03-14'),
        height: 178,
        weight: 74,
        injuryHistory: SEGREDOS.injuryHistory,
        currentInjuries: SEGREDOS.currentInjuries,
        hasHealthIssues: true,
        healthIssuesDesc: SEGREDOS.healthIssuesDesc,
        takesMedication: true,
        medicationDesc: SEGREDOS.medicationDesc,
        goals: SEGREDOS.goals,
        strengths: SEGREDOS.strengths,
        weaknesses: SEGREDOS.weaknesses,
        trainingDaysPerWeek: 5,
        acceptedTerms: true,
      },
    });
    createdProfileIds.add(profile.id);

    return user;
  }

  beforeAll(async () => {
    process.env.NEXTAUTH_SECRET = 'e2e-secret-nao-usado-em-producao';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    await makeUser(`${TAG}publico`, true);
    await makeUser(`${TAG}privado`, false);
  });

  afterAll(async () => {
    await prisma.athleteProfile.deleteMany({ where: { id: { in: [...createdProfileIds] } } });
    await prisma.user.deleteMany({ where: { id: { in: [...createdUserIds] } } });
    await app?.close();
  });

  const get = (username: string) =>
    request(app.getHttpServer()).get(`/users/public/${username}`);

  describe('exposição — sem nenhuma credencial', () => {
    it('responde 200 sem sessão', async () => {
      const res = await get(`${TAG}publico`);
      expect(res.status).toBe(200);
      expect(res.body.user.username).toBe(`${TAG}publico`);
    });

    /** A asserção central da fatia. */
    it('NENHUM valor sensível aparece no corpo', async () => {
      const res = await get(`${TAG}publico`);
      const corpo = JSON.stringify(res.body);

      for (const [campo, valor] of Object.entries(SEGREDOS)) {
        expect(corpo).not.toContain(valor);
        // Mensagem útil se quebrar: diz qual campo vazou.
        if (corpo.includes(valor)) throw new Error(`vazou ${campo}`);
      }
    });

    it('nenhum NOME de campo proibido aparece no corpo', async () => {
      const res = await get(`${TAG}publico`);
      const corpo = JSON.stringify(res.body);

      for (const campo of NEVER_PUBLIC) {
        expect(corpo).not.toContain(`"${campo}"`);
      }
    });

    it('valores numéricos sensíveis também ficam fora', async () => {
      const res = await get(`${TAG}publico`);
      const perfil = res.body.user.athleteProfiles[0];

      expect(perfil).not.toHaveProperty('height');
      expect(perfil).not.toHaveProperty('weight');
      expect(perfil).not.toHaveProperty('dateOfBirth');
      expect(perfil).not.toHaveProperty('dominantFoot');
      expect(perfil).not.toHaveProperty('trainingDaysPerWeek');
    });

    it('devolve exatamente o recorte acordado', async () => {
      const res = await get(`${TAG}publico`);

      expect(Object.keys(res.body.user).sort()).toEqual(
        ['athleteProfiles', 'bio', 'createdAt', 'image', 'name', 'roles', 'username'].sort(),
      );
      expect(Object.keys(res.body.user.athleteProfiles[0]).sort()).toEqual(
        ['position', 'sport', 'teams', 'technicalLevel', 'yearsPlaying'].sort(),
      );
    });

    it('o esporte vem com nome e slug, sem id nem outros campos', async () => {
      const res = await get(`${TAG}publico`);
      expect(Object.keys(res.body.user.athleteProfiles[0].sport).sort()).toEqual(['name', 'slug']);
    });

    it('a anamnese continua gravada no banco — o que muda é só o que sai', async () => {
      const user = await prisma.user.findFirst({
        where: { username: `${TAG}publico` },
        include: { athleteProfiles: true },
      });
      expect(user!.athleteProfiles[0].medicationDesc).toBe(SEGREDOS.medicationDesc);
    });
  });

  describe('visibilidade', () => {
    it('perfil privado → 404', async () => {
      const res = await get(`${TAG}privado`);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Usuário não encontrado.' });
    });

    it('username inexistente → 404 com corpo idêntico ao privado', async () => {
      const privado = await get(`${TAG}privado`);
      const inexistente = await get(`${TAG}naoexiste`);

      expect(inexistente.status).toBe(privado.status);
      expect(inexistente.body).toEqual(privado.body);
    });

    it('o 404 do privado não vaza nada do perfil', async () => {
      const res = await get(`${TAG}privado`);
      const corpo = JSON.stringify(res.body);
      for (const valor of Object.values(SEGREDOS)) {
        expect(corpo).not.toContain(valor);
      }
    });
  });

  describe('busca', () => {
    it('casa ignorando capitalização', async () => {
      const res = await get(`${TAG}publico`.toUpperCase());
      expect(res.status).toBe(200);
      expect(res.body.user.username).toBe(`${TAG}publico`);
    });
  });

  describe('schema — isPublic default false (D23)', () => {
    it('usuário criado sem informar isPublic nasce privado', async () => {
      const u = await prisma.user.create({
        data: { email: `${TAG}-default@example.com`, name: 'Default E2E' },
      });
      createdUserIds.add(u.id);

      expect(u.isPublic).toBe(false);
    });
  });
});
