import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { encode } from 'next-auth/jwt';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma/prisma.service';
import { DEFAULT_SPORTS } from '@/sports/default-sports';

const SECRET = 'e2e-secret-nao-usado-em-producao';
const TAG = 'e2e-sports';

function mint(claims: Record<string, unknown>): Promise<string> {
  return encode({ token: claims, secret: SECRET });
}

describe('/sports (e2e, Postgres real)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let moderatorToken: string;
  let userToken: string;

  /** Ids criados durante a suíte, para o cleanup não depender de convenção. */
  const createdSportIds = new Set<string>();
  const createdUserIds = new Set<string>();
  const createdProfileIds = new Set<string>();

  async function makeSport(data: {
    name: string;
    slug: string;
    isActive?: boolean;
    positions?: string[];
  }) {
    const sport = await prisma.sport.create({
      data: {
        name: data.name,
        slug: data.slug,
        isActive: data.isActive ?? true,
        positions: data.positions ?? [],
      },
    });
    createdSportIds.add(sport.id);
    return sport;
  }

  beforeAll(async () => {
    process.env.NEXTAUTH_SECRET = SECRET;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    adminToken = await mint({ id: 'e2e-admin', systemRoles: ['ADMIN'], roles: ['PROFESSIONAL'] });
    moderatorToken = await mint({ id: 'e2e-mod', systemRoles: ['MODERATOR'], roles: ['PROFESSIONAL'] });
    userToken = await mint({ id: 'e2e-user', systemRoles: ['USER'], roles: ['INDIVIDUAL'] });
  });

  afterAll(async () => {
    // Perfis antes de esportes: AthleteProfile.sportId é FK sem cascade.
    if (createdProfileIds.size > 0) {
      await prisma.athleteProfile.deleteMany({ where: { id: { in: [...createdProfileIds] } } });
    }
    if (createdSportIds.size > 0) {
      await prisma.sport.deleteMany({ where: { id: { in: [...createdSportIds] } } });
    }
    // Rede de segurança: pega também o que as rotas criaram sem passar por makeSport.
    await prisma.sport.deleteMany({ where: { slug: { startsWith: TAG } } });
    if (createdUserIds.size > 0) {
      await prisma.user.deleteMany({ where: { id: { in: [...createdUserIds] } } });
    }
    await app?.close();
  });

  describe('GET /sports — público (propriedades 1–6)', () => {
    it('responde sem sessão', async () => {
      const res = await request(app.getHttpServer()).get('/sports');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.sports)).toBe(true);
    });

    it('não devolve esporte inativo', async () => {
      const inativo = await makeSport({
        name: 'ZZZ Inativo',
        slug: `${TAG}-inativo`,
        isActive: false,
      });

      const res = await request(app.getHttpServer()).get('/sports');
      expect(res.body.sports.map((s: { id: string }) => s.id)).not.toContain(inativo.id);
    });

    /**
     * Compara só a ordem RELATIVA das fixtures desta suíte, não a lista inteira.
     *
     * Duas razões, as duas descobertas por este teste falhando:
     * 1. Quem ordena é o Postgres, com a collation dele — que põe 'BBB Beta'
     *    antes de 'Basquete' (byte order). `localeCompare` do JS decide o
     *    contrário, então afirmar a lista inteira com sort do JS compara
     *    collations diferentes e acusa erro onde não há.
     * 2. A lista contém linhas que esta suíte não criou (os 14 padrões que o
     *    `syncDefaults` grava e o cleanup preserva, por serem dado de
     *    plataforma). Afirmar a lista inteira tornava o teste dependente de
     *    banco limpo: passava na primeira execução e falhava na segunda.
     */
    it('devolve esporte ativo, com as fixtures em ordem de nome', async () => {
      await makeSport({ name: 'AAA Alfa E2E', slug: `${TAG}-alfa` });
      await makeSport({ name: 'AAB Beta E2E', slug: `${TAG}-beta` });

      const res = await request(app.getHttpServer()).get('/sports');
      const nomes: string[] = res.body.sports.map((s: { name: string }) => s.name);

      const alfa = nomes.indexOf('AAA Alfa E2E');
      const beta = nomes.indexOf('AAB Beta E2E');
      expect(alfa).toBeGreaterThanOrEqual(0);
      expect(beta).toBeGreaterThan(alfa);
    });

    it('positions vazio no banco recebe a lista do DEFAULT_SPORTS pelo slug', async () => {
      // Upsert porque 'soccer' pode já existir de um seed anterior.
      const soccer = await prisma.sport.upsert({
        where: { slug: 'soccer' },
        create: { name: 'Futebol', slug: 'soccer', isActive: true, positions: [] },
        update: { isActive: true, positions: [] },
      });

      const res = await request(app.getHttpServer()).get('/sports');
      const encontrado = res.body.sports.find((s: { id: string }) => s.id === soccer.id);

      expect(encontrado.positions).toContain('Goleiro');
      expect(encontrado.positions).toContain('Atacante');
    });

    it('positions preenchido no banco não é sobrescrito', async () => {
      const custom = await makeSport({
        name: 'Custom Positions',
        slug: `${TAG}-custom`,
        positions: ['Posição Única'],
      });

      const res = await request(app.getHttpServer()).get('/sports');
      const encontrado = res.body.sports.find((s: { id: string }) => s.id === custom.id);
      expect(encontrado.positions).toEqual(['Posição Única']);
    });

    it('slug desconhecido com positions vazio devolve lista vazia', async () => {
      const exotico = await makeSport({ name: 'Xadrez-Boxe', slug: `${TAG}-desconhecido` });

      const res = await request(app.getHttpServer()).get('/sports');
      const encontrado = res.body.sports.find((s: { id: string }) => s.id === exotico.id);
      expect(encontrado.positions).toEqual([]);
    });
  });

  describe('guard de roles (propriedades 7–10)', () => {
    // Propriedade 7 — a ordem dos guards: sem sessão é 401, nunca 403.
    it.each([
      ['GET', '/admin/sports'],
      ['POST', '/admin/sports'],
      ['PATCH', '/admin/sports/qualquer'],
      ['DELETE', '/admin/sports/qualquer'],
    ])('%s %s sem sessão → 401, não 403', async (method, path) => {
      const res = await request(app.getHttpServer())[
        method.toLowerCase() as 'get' | 'post' | 'patch' | 'delete'
      ](path);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Não autorizado' });
    });

    // Propriedade 8
    it('usuário comum recebe 403 com corpo { error }', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/sports')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Acesso negado' });
    });

    // Propriedade 9
    it('ADMIN passa', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/sports')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
    });

    // Propriedade 10 — fidelidade ao achado A1.
    it('MODERATOR passa, inclusive no DELETE', async () => {
      const alvo = await makeSport({ name: 'Mod Delete', slug: `${TAG}-mod-delete` });

      const lista = await request(app.getHttpServer())
        .get('/admin/sports')
        .set('Authorization', `Bearer ${moderatorToken}`);
      expect(lista.status).toBe(200);

      const del = await request(app.getHttpServer())
        .delete(`/admin/sports/${alvo.id}`)
        .set('Authorization', `Bearer ${moderatorToken}`);
      expect(del.status).toBe(200);
      createdSportIds.delete(alvo.id);
    });
  });

  describe('GET /admin/sports (propriedade 11)', () => {
    it('inclui esporte inativo e a contagem de perfis', async () => {
      const inativo = await makeSport({
        name: 'Inativo Admin',
        slug: `${TAG}-inativo-admin`,
        isActive: false,
      });

      const res = await request(app.getHttpServer())
        .get('/admin/sports')
        .set('Authorization', `Bearer ${adminToken}`);

      const encontrado = res.body.find((s: { id: string }) => s.id === inativo.id);
      expect(encontrado).toBeDefined();
      expect(encontrado._count.profiles).toBe(0);
    });
  });

  describe('POST /admin/sports (propriedades 12–16)', () => {
    const auth = () => ({ Authorization: `Bearer ${adminToken}` });

    it.each([
      ['sem name', { slug: `${TAG}-x` }],
      ['sem slug', { name: 'X' }],
    ])('rejeita %s com 400', async (_label, body) => {
      const res = await request(app.getHttpServer())
        .post('/admin/sports')
        .set(auth())
        .send(body);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Nome e slug são obrigatórios.');
    });

    it('rejeita slug com maiúscula', async () => {
      const res = await request(app.getHttpServer())
        .post('/admin/sports')
        .set(auth())
        .send({ name: 'X', slug: 'Invalido' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Slug inválido/);
    });

    it('cria com 201, isActive true', async () => {
      const res = await request(app.getHttpServer())
        .post('/admin/sports')
        .set(auth())
        .send({ name: 'Criado E2E', slug: `${TAG}-criado`, positions: ['P1'] });

      expect(res.status).toBe(201);
      expect(res.body.isActive).toBe(true);
      expect(res.body.positions).toEqual(['P1']);
      createdSportIds.add(res.body.id);
    });

    it('rejeita slug duplicado com 409', async () => {
      const res = await request(app.getHttpServer())
        .post('/admin/sports')
        .set(auth())
        .send({ name: 'Duplicado', slug: `${TAG}-criado` });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Já existe um esporte com este slug.');
    });

    // Propriedade 16 — idempotência provada contra o banco, rodando duas vezes.
    it('syncDefaults faz upsert de todos os padrões e é idempotente', async () => {
      const primeira = await request(app.getHttpServer())
        .post('/admin/sports')
        .set(auth())
        .send({ action: 'syncDefaults' });

      expect(primeira.status).toBe(201);
      expect(primeira.body.synced).toBe(DEFAULT_SPORTS.length);

      const depoisDaPrimeira = await prisma.sport.count({
        where: { slug: { in: DEFAULT_SPORTS.map((s) => s.slug) } },
      });
      expect(depoisDaPrimeira).toBe(DEFAULT_SPORTS.length);

      await request(app.getHttpServer())
        .post('/admin/sports')
        .set(auth())
        .send({ action: 'syncDefaults' });

      const depoisDaSegunda = await prisma.sport.count({
        where: { slug: { in: DEFAULT_SPORTS.map((s) => s.slug) } },
      });
      expect(depoisDaSegunda).toBe(depoisDaPrimeira);
    });
  });

  describe('PATCH /admin/sports/:id (propriedades 17–21)', () => {
    const auth = () => ({ Authorization: `Bearer ${adminToken}` });

    it('devolve 404 para id inexistente', async () => {
      const res = await request(app.getHttpServer())
        .patch('/admin/sports/nao-existe')
        .set(auth())
        .send({ name: 'X' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Esporte não encontrado');
    });

    it('aplica só os campos enviados', async () => {
      const sport = await makeSport({
        name: 'Antes',
        slug: `${TAG}-patch`,
        positions: ['Mantida'],
      });

      const res = await request(app.getHttpServer())
        .patch(`/admin/sports/${sport.id}`)
        .set(auth())
        .send({ name: 'Depois' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Depois');
      expect(res.body.slug).toBe(`${TAG}-patch`);
      expect(res.body.positions).toEqual(['Mantida']);
    });

    it('rejeita slug de outro esporte com 409', async () => {
      const a = await makeSport({ name: 'Slug A', slug: `${TAG}-slug-a` });
      await makeSport({ name: 'Slug B', slug: `${TAG}-slug-b` });

      const res = await request(app.getHttpServer())
        .patch(`/admin/sports/${a.id}`)
        .set(auth())
        .send({ slug: `${TAG}-slug-b` });

      expect(res.status).toBe(409);
    });

    it('aceita reenviar o próprio slug', async () => {
      const sport = await makeSport({ name: 'Mesmo Slug', slug: `${TAG}-mesmo` });

      const res = await request(app.getHttpServer())
        .patch(`/admin/sports/${sport.id}`)
        .set(auth())
        .send({ slug: `${TAG}-mesmo`, name: 'Renomeado' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Renomeado');
    });

    // A4 provado contra a rota real: 31 caracteres passa no POST e falha no PATCH.
    it('slug de 31 caracteres: aceito no POST, rejeitado no PATCH', async () => {
      const slug31 = 'a'.repeat(31);

      const criado = await request(app.getHttpServer())
        .post('/admin/sports')
        .set(auth())
        .send({ name: 'Slug Longo', slug: slug31 });
      expect(criado.status).toBe(201);
      createdSportIds.add(criado.body.id);

      const editado = await request(app.getHttpServer())
        .patch(`/admin/sports/${criado.body.id}`)
        .set(auth())
        .send({ slug: slug31 });
      expect(editado.status).toBe(400);
    });

    // Propriedade 18 — exige AthleteProfile real, e é por isso que este e2e
    // precisa de banco: o vínculo é uma FK, não um mock.
    it('bloqueia desativação com atleta vinculado', async () => {
      const sport = await makeSport({ name: 'Com Atleta', slug: `${TAG}-com-atleta` });
      const user = await prisma.user.create({
        data: { email: `${TAG}-atleta@example.com`, name: 'Atleta E2E' },
      });
      createdUserIds.add(user.id);
      const profile = await prisma.athleteProfile.create({
        data: { userId: user.id, sportId: sport.id },
      });
      createdProfileIds.add(profile.id);

      const res = await request(app.getHttpServer())
        .patch(`/admin/sports/${sport.id}`)
        .set(auth())
        .send({ isActive: false });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/1 atletas vinculados/);
      expect(res.body.canDelete).toBe(false);

      const aindaAtivo = await prisma.sport.findUnique({ where: { id: sport.id } });
      expect(aindaAtivo!.isActive).toBe(true);
    });
  });

  describe('DELETE /admin/sports/:id (propriedades 22–24)', () => {
    const auth = () => ({ Authorization: `Bearer ${adminToken}` });

    // Propriedade 24 — D14: o legado devolvia 500 aqui.
    it('devolve 404 para id inexistente, não 500', async () => {
      const res = await request(app.getHttpServer())
        .delete('/admin/sports/nao-existe-mesmo')
        .set(auth());

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Esporte não encontrado');
    });

    it('bloqueia exclusão com atleta vinculado, sem apagar', async () => {
      const sport = await makeSport({ name: 'Del Bloqueado', slug: `${TAG}-del-bloq` });
      const user = await prisma.user.create({
        data: { email: `${TAG}-atleta2@example.com`, name: 'Atleta E2E 2' },
      });
      createdUserIds.add(user.id);
      const profile = await prisma.athleteProfile.create({
        data: { userId: user.id, sportId: sport.id },
      });
      createdProfileIds.add(profile.id);

      const res = await request(app.getHttpServer())
        .delete(`/admin/sports/${sport.id}`)
        .set(auth());

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Existem 1 atletas vinculados/);

      const aindaExiste = await prisma.sport.findUnique({ where: { id: sport.id } });
      expect(aindaExiste).not.toBeNull();
    });

    it('apaga quando não há vínculo', async () => {
      const sport = await makeSport({ name: 'Del OK', slug: `${TAG}-del-ok` });

      const res = await request(app.getHttpServer())
        .delete(`/admin/sports/${sport.id}`)
        .set(auth());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const sumiu = await prisma.sport.findUnique({ where: { id: sport.id } });
      expect(sumiu).toBeNull();
      createdSportIds.delete(sport.id);
    });
  });
});
