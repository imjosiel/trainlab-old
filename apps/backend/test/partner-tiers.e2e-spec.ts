import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { encode } from 'next-auth/jwt';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma/prisma.service';

const SECRET = 'e2e-secret-nao-usado-em-producao';
const TAG = 'e2e-tier';

function mint(claims: Record<string, unknown>): Promise<string> {
  return encode({ token: claims, secret: SECRET });
}

/**
 * Fatia 14 — tiers do parceiro. Spec: docs/implementation-plans/epic-nest-tiers-parceiro.md
 *
 * Toda asserção de 401/403 vai PAREADA com o caso legítimo em 200: no red da
 * fatia 12 os cinco e2e que afirmavam só o status negativo passaram, porque
 * nenhuma rota existia (A55).
 *
 * A invariante "só um tier é padrão" (D72) é a razão principal deste arquivo
 * existir: ela é sobre a TABELA, não sobre uma linha, e só é observável contra
 * banco de verdade.
 */
describe('/admin/partner-tiers e /partner/tiers (e2e, Postgres real)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let admin: string;
  let profissional: string;
  let cliente: string;

  let tokenAdmin: string;
  let tokenProfissional: string;
  let tokenCliente: string;

  const usuarios = new Set<string>();
  const tiers = new Set<string>();

  /**
   * A73 — quais tiers eram padrão ANTES desta suíte.
   *
   * A invariante do D72 é sobre a TABELA, então testá-la exige um `updateMany`
   * que alcança linhas que a suíte não criou. Na primeira execução isso desmarcou
   * o `starter` real do banco de desenvolvimento e deixou **zero** padrões — que
   * é justamente o estado quebrado do A69.
   *
   * Limpar só o que se criou não basta quando a escrita é sobre o conjunto.
   */
  let padroesOriginais: string[] = [];

  async function criarTier(sufixo: string, over: Record<string, unknown> = {}) {
    const t = await prisma.partnerTier.create({
      data: {
        slug: `${TAG}-${sufixo}`,
        name: `${TAG} ${sufixo}`,
        commissionRate: 0.5,
        price: 0,
        minPrice: 0,
        isActive: true,
        ...over,
      },
    });
    tiers.add(t.id);
    return t;
  }

  beforeAll(async () => {
    process.env.NEXTAUTH_SECRET = SECRET;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const criar = async (sufixo: string, roles: string[], systemRoles: string[]) => {
      const u = await prisma.user.create({
        data: {
          email: `${TAG}-${sufixo}@example.com`,
          name: `Usuário ${sufixo}`,
          roles: roles as never,
          systemRoles: systemRoles as never,
        },
      });
      usuarios.add(u.id);
      return u;
    };

    const a = await criar('admin', ['PROFESSIONAL'], ['ADMIN']);
    const p = await criar('prof', ['PROFESSIONAL'], ['USER']);
    const c = await criar('cliente', ['CLIENT'], ['USER']);
    admin = a.id;
    profissional = p.id;
    cliente = c.id;

    tokenAdmin = await mint({ id: admin, email: a.email, roles: ['PROFESSIONAL'], systemRoles: ['ADMIN'] });
    tokenProfissional = await mint({ id: profissional, email: p.email, roles: ['PROFESSIONAL'], systemRoles: ['USER'] });
    tokenCliente = await mint({ id: cliente, email: c.email, roles: ['CLIENT'], systemRoles: ['USER'] });

    padroesOriginais = (
      await prisma.partnerTier.findMany({ where: { isDefault: true }, select: { id: true } })
    ).map((t) => t.id);
  });

  afterAll(async () => {
    const ids = [...usuarios];
    await prisma.partnerTierRequest.deleteMany({ where: { toTierId: { in: [...tiers] } } });
    await prisma.partnerAccount.deleteMany({ where: { userId: { in: ids } } });
    await prisma.partnerTier.deleteMany({ where: { id: { in: [...tiers] } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });

    // A73: devolve o `isDefault` de quem já estava aqui. Sem isto, rodar a
    // suíte deixa o banco sem tier padrão.
    if (padroesOriginais.length > 0) {
      await prisma.partnerTier.updateMany({
        where: { id: { in: padroesOriginais } },
        data: { isDefault: true },
      });
    }

    await app?.close();
  });

  const comoAdmin = () => ({ Authorization: `Bearer ${tokenAdmin}` });
  const comoProfissional = () => ({ Authorization: `Bearer ${tokenProfissional}` });
  const comoCliente = () => ({ Authorization: `Bearer ${tokenCliente}` });
  const http = () => request(app.getHttpServer());

  /* ────────────────────────────────────────────────────────────────────────── */

  describe('autorização (D74, corrige A72)', () => {
    it('sem sessão → 401; admin → 200', async () => {
      const semSessao = await http().get('/admin/partner-tiers');
      const comAdmin = await http().get('/admin/partner-tiers').set(comoAdmin());

      expect(semSessao.status).toBe(401);
      expect(comAdmin.status).toBe(200);
    });

    // O legado devolvia 401 aqui. 401 é "não sei quem é você"; este requisitante
    // está identificado e apenas não tem o privilégio (D11).
    it('sessão sem admin → 403, não 401', async () => {
      const res = await http().get('/admin/partner-tiers').set(comoProfissional());
      expect(res.status).toBe(403);
    });

    it('a rota do parceiro aceita profissional e recusa cliente', async () => {
      const prof = await http().get('/partner/tiers').set(comoProfissional());
      const cli = await http().get('/partner/tiers').set(comoCliente());

      expect(prof.status).toBe(200);
      expect(cli.status).toBe(403);
    });

    it('a rota pública responde SEM sessão', async () => {
      const res = await http().get('/public/partner-tiers');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.tiers)).toBe(true);
    });

    it('a rota pública não devolve campos internos (A71)', async () => {
      await criarTier('publico');

      const res = await http().get('/public/partner-tiers');
      const meu = res.body.tiers.find((t: { slug: string }) => t.slug === `${TAG}-publico`);

      expect(meu).toBeDefined();
      expect(meu).not.toHaveProperty('payoutDelayDays');
      expect(meu).not.toHaveProperty('payoutSchedule');
      expect(meu).not.toHaveProperty('hourlyRatePolicy');
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * D72 — a invariante da tabela
   * ────────────────────────────────────────────────────────────────────────── */

  describe('isDefault — exatamente um padrão (D72, corrige A69)', () => {
    it('promover um tier a padrão deixa a tabela com UM padrão', async () => {
      const a = await criarTier('padrao-a', { isDefault: true });
      const b = await criarTier('padrao-b');

      const res = await http()
        .put(`/admin/partner-tiers/${b.id}`)
        .set(comoAdmin())
        .send({ isDefault: true });

      expect(res.status).toBe(200);

      const padroes = await prisma.partnerTier.findMany({
        where: { isDefault: true },
        select: { id: true },
      });
      expect(padroes).toHaveLength(1);
      expect(padroes[0].id).toBe(b.id);

      // Anti-vacuidade: "só um é padrão" também seria verdade se NENHUM fosse, e
      // o A69 é exatamente o estado em que a tabela fica sem padrão nenhum.
      const anterior = await prisma.partnerTier.findUnique({ where: { id: a.id } });
      expect(anterior!.isDefault).toBe(false);
    });

    it('criar um tier padrão desmarca o anterior', async () => {
      await criarTier('padrao-c', { isDefault: true });

      const res = await http()
        .post('/admin/partner-tiers')
        .set(comoAdmin())
        .send({ name: `${TAG} novo padrão`, slug: `${TAG}-padrao-d`, commissionRate: 0.45, isDefault: true });

      expect(res.status).toBe(201);
      tiers.add(res.body.tier.id);

      const padroes = await prisma.partnerTier.findMany({ where: { isDefault: true } });
      expect(padroes).toHaveLength(1);
      expect(padroes[0].id).toBe(res.body.tier.id);
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * A68 — os campos numéricos
   * ────────────────────────────────────────────────────────────────────────── */

  describe('validação numérica (D71, corrige A68)', () => {
    it.each([
      ['price', 'abc'],
      ['minPrice', 'abc'],
      ['price', -1],
      ['commissionRate', 2],
    ])('%s = %p → 400, não 500, e nada criado', async (campo, valor) => {
      const antes = await prisma.partnerTier.count();

      const res = await http()
        .post('/admin/partner-tiers')
        .set(comoAdmin())
        .send({ name: 'X', slug: `${TAG}-invalido`, commissionRate: 0.5, [campo]: valor });

      expect(res.status).toBe(400);
      expect(await prisma.partnerTier.count()).toBe(antes);
    });

    // CONTROLE: sem ele, um POST que rejeitasse tudo passaria em cada caso acima.
    it('[controle] corpo válido → 201 e a linha existe', async () => {
      const res = await http()
        .post('/admin/partner-tiers')
        .set(comoAdmin())
        .send({ name: `${TAG} válido`, slug: `${TAG}-valido`, commissionRate: 0.55, price: 149.9, minPrice: 79.9 });

      expect(res.status).toBe(201);
      tiers.add(res.body.tier.id);

      const noBanco = await prisma.partnerTier.findUnique({ where: { id: res.body.tier.id } });
      expect(noBanco!.price).toBe(149.9);
      expect(noBanco!.commissionRate).toBe(0.55);
    });

    it('slug duplicado → 409', async () => {
      await criarTier('duplicado');

      const res = await http()
        .post('/admin/partner-tiers')
        .set(comoAdmin())
        .send({ name: 'X', slug: `${TAG}-duplicado`, commissionRate: 0.5 });

      expect(res.status).toBe(409);
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * A70 — listagem não semeia
   * ────────────────────────────────────────────────────────────────────────── */

  describe('listagem não escreve (D73, corrige A70)', () => {
    it('GET /admin/partner-tiers não cria linha nenhuma', async () => {
      const antes = await prisma.partnerTier.count();

      const res = await http().get('/admin/partner-tiers').set(comoAdmin());

      expect(res.status).toBe(200);
      expect(await prisma.partnerTier.count()).toBe(antes);
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * Pedidos de troca
   * ────────────────────────────────────────────────────────────────────────── */

  describe('pedidos de troca de tier', () => {
    async function cenario() {
      const origem = await criarTier(`origem-${Math.round(Math.random() * 1e6)}`);
      const destino = await criarTier(`destino-${Math.round(Math.random() * 1e6)}`, {
        commissionRate: 0.35,
      });
      const conta = await prisma.partnerAccount.create({
        data: { userId: profissional, status: 'approved', tierId: origem.id, partnerTier: origem.slug },
      });
      const pedido = await prisma.partnerTierRequest.create({
        data: { partnerId: conta.id, fromTierId: origem.id, toTierId: destino.id, status: 'pending' },
      });
      return { origem, destino, conta, pedido };
    }

    afterEach(async () => {
      await prisma.partnerTierRequest.deleteMany({ where: { toTierId: { in: [...tiers] } } });
      await prisma.partnerAccount.deleteMany({ where: { userId: profissional } });
    });

    it('aprovar move os três campos do parceiro', async () => {
      const { destino, conta, pedido } = await cenario();

      const res = await http()
        .patch(`/admin/tier-requests/${pedido.id}`)
        .set(comoAdmin())
        .send({ action: 'approved' });

      expect(res.status).toBe(200);

      const depois = await prisma.partnerAccount.findUnique({ where: { id: conta.id } });
      expect(depois!.tierId).toBe(destino.id);
      expect(depois!.partnerTier).toBe(destino.slug);
      expect(depois!.commissionRate).toBe(destino.commissionRate);
    });

    it('rejeitar deixa o tier onde estava', async () => {
      const { origem, conta, pedido } = await cenario();

      const res = await http()
        .patch(`/admin/tier-requests/${pedido.id}`)
        .set(comoAdmin())
        .send({ action: 'rejected', note: 'fora de política' });

      expect(res.status).toBe(200);

      const depois = await prisma.partnerAccount.findUnique({ where: { id: conta.id } });
      expect(depois!.tierId).toBe(origem.id);

      // Anti-vacuidade: o pedido TEM que ter mudado de status.
      const req = await prisma.partnerTierRequest.findUnique({ where: { id: pedido.id } });
      expect(req!.status).toBe('rejected');
    });

    it('duas aprovações simultâneas: uma 200, outra 400', async () => {
      const { pedido } = await cenario();

      const [a, b] = await Promise.all([
        http().patch(`/admin/tier-requests/${pedido.id}`).set(comoAdmin()).send({ action: 'approved' }),
        http().patch(`/admin/tier-requests/${pedido.id}`).set(comoAdmin()).send({ action: 'approved' }),
      ]);

      expect([a.status, b.status].sort()).toEqual([200, 400]);
    });

    it('não-admin não decide → 403, e admin decide → 200', async () => {
      const { pedido } = await cenario();

      const comoProf = await http()
        .patch(`/admin/tier-requests/${pedido.id}`)
        .set(comoProfissional())
        .send({ action: 'approved' });
      const comAdmin = await http()
        .patch(`/admin/tier-requests/${pedido.id}`)
        .set(comoAdmin())
        .send({ action: 'approved' });

      expect(comoProf.status).toBe(403);
      expect(comAdmin.status).toBe(200);
    });
  });
});
