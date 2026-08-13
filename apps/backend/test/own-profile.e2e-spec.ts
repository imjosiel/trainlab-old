import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { encode } from 'next-auth/jwt';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma/prisma.service';
import { OWN_PARTNER_ACCOUNT_SELECT } from '@/users/own-profile.select';

const SECRET = 'e2e-secret-nao-usado-em-producao';
const TAG = 'e2eproprio';

function mint(claims: Record<string, unknown>): Promise<string> {
  return encode({ token: claims, secret: SECRET });
}

/** JWT plausível do Google: header.payload.assinatura, payload em base64url. */
function fakeGoogleIdToken(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'RS256' })}.${b64(payload)}.assinatura-nao-verificada`;
}

/**
 * Fatia 5. Duas coisas só são prováveis contra o Postgres de verdade:
 *
 *  - o recorte de `partnerAccount` (mock ignora `select`, então com Prisma
 *    mockado quem "filtra" é a fixture — o teste provaria a si mesmo);
 *  - o bug de gamificação do A12, que é da ORDENAÇÃO do banco. Um mock que
 *    devolve o array na ordem que o teste quiser não tem como reprovar nada.
 */
describe('/users/profile (e2e, Postgres real)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  /** Valores sentinela: se aparecerem na resposta, o recorte falhou. */
  const SEGREDOS_PARCEIRO = {
    motivation: 'SENTINELA-motivacao-da-candidatura',
    approvedById: 'SENTINELA-id-do-admin',
    stripeAccountId: 'acct_SENTINELA_123',
    customCommissionRate: 0.71,
    bonusThreshold: 900000,
    bonusRateDrop: 0.05,
    minimumPayoutAmount: 12345,
  };

  const ids = { A: '', B: '', semParceiro: '', gamer: '', trainer: '', semEmail: '' };
  const tokens: Record<keyof typeof ids, string> = {} as never;
  const criados = new Set<string>();
  let planoGamerId = '';
  let studentId = '';

  async function makeUser(
    chave: keyof typeof ids,
    data: Record<string, unknown> = {},
  ): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: data.email === null ? null : `${TAG}-${chave}@example.com`,
        name: `Usuário ${chave}`,
        roles: ['INDIVIDUAL'],
        systemRoles: ['USER'],
        ...data,
      } as never,
    });
    ids[chave] = user.id;
    criados.add(user.id);
    tokens[chave] = await mint({
      id: user.id,
      email: user.email,
      roles: user.roles,
      systemRoles: user.systemRoles,
    });
    return user.id;
  }

  beforeAll(async () => {
    process.env.NEXTAUTH_SECRET = SECRET;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    await makeUser('A', {
      username: `${TAG}alfa`,
      bio: 'bio do alfa',
      phone: '(11) 98888-7777',
      isPublic: false,
      roles: ['INDIVIDUAL', 'PARTNER_B2B'],
      partnerAccount: {
        create: {
          status: 'rejected',
          rejectionReason: 'motivo visível de propósito',
          payoutsEnabled: false,
          chargesEnabled: false,
          stripeAccountStatus: 'restricted',
          payoutsFrozen: true,
          allowTestMode: true,
          commissionRate: 0.5,
          partnerTier: 'gold',
          ...SEGREDOS_PARCEIRO,
        },
      },
    });
    await makeUser('B', { username: `${TAG}beta`, bio: 'bio do beta' });
    await makeUser('semParceiro', { username: `${TAG}sozinho` });
    await makeUser('trainer', { roles: ['PROFESSIONAL'] });
    await makeUser('gamer');
    await makeUser('semEmail', { email: null });

    // ── Fixture de gamificação ────────────────────────────────────────────────
    // Números escolhidos para distinguir TRÊS implementações:
    //   correta            → rate 38%, streak 7
    //   legado (A12)       → rate  0%, streak 0  (500 nulls ocupam o take:500)
    //   só `nulls: 'last'` → rate 60%, streak 7  (o teto ainda distorce a taxa)
    const plano = await prisma.trainingPlan.create({
      data: { title: `${TAG}-plano`, aiSuggestion: '{}', athleteId: ids.gamer, segment: 'COACH' },
    });
    planoGamerId = plano.id;

    const sessoes: Array<Record<string, unknown>> = [];
    // 7 dias consecutivos concluídos, terminando hoje → streak 7.
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(9, 0, 0, 0);
      sessoes.push({
        planId: plano.id,
        day: i + 1,
        title: `${TAG}-completa-recente-${i}`,
        completed: true,
        completedAt: d,
      });
    }
    // 293 concluídas, todas no MESMO dia de 30 dias atrás — engordam a taxa sem
    // encostar na sequência (a lacuna entre -6 e -30 interrompe o streak).
    const antiga = new Date();
    antiga.setDate(antiga.getDate() - 30);
    antiga.setHours(9, 0, 0, 0);
    for (let i = 0; i < 293; i++) {
      sessoes.push({
        planId: plano.id,
        day: 100 + i,
        title: `${TAG}-completa-antiga-${i}`,
        completed: true,
        completedAt: antiga,
      });
    }
    // 500 nunca concluídas: completedAt = null. É o que o legado põe na frente.
    for (let i = 0; i < 500; i++) {
      sessoes.push({
        planId: plano.id,
        day: 1000 + i,
        title: `${TAG}-incompleta-${i}`,
        completed: false,
      });
    }
    await prisma.trainingSession.createMany({ data: sessoes as never });

    // Plano alcançado por student.userId, não por athleteId (propriedade 33).
    const student = await prisma.student.create({
      data: { name: 'Aluno vinculado', trainerId: ids.trainer, userId: ids.B },
    });
    studentId = student.id;
    const planoDoStudent = await prisma.trainingPlan.create({
      data: {
        title: `${TAG}-plano-student`,
        aiSuggestion: '{}',
        studentId: student.id,
        trainerId: ids.trainer,
        segment: 'COACH',
      },
    });
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    ontem.setHours(9, 0, 0, 0);
    await prisma.trainingSession.createMany({
      data: [
        {
          planId: planoDoStudent.id,
          day: 1,
          title: `${TAG}-student-completa`,
          completed: true,
          completedAt: ontem,
        },
        { planId: planoDoStudent.id, day: 2, title: `${TAG}-student-incompleta`, completed: false },
      ] as never,
    });
  });

  afterAll(async () => {
    await prisma.trainingSession.deleteMany({ where: { plan: { title: { startsWith: TAG } } } });
    await prisma.trainingPlan.deleteMany({ where: { title: { startsWith: TAG } } });
    await prisma.student.deleteMany({ where: { id: studentId } });
    await prisma.account.deleteMany({ where: { providerAccountId: { startsWith: TAG } } });

    // Limpeza por id E por email/username com o TAG.
    //
    // Só por id não basta, e isso foi medido: rodando a mutação de mass
    // assignment, o teste `{ id: 'outro-id' }` reescreveu a CHAVE PRIMÁRIA do
    // usuário. O delete por id não achou mais a linha, ela sobreviveu com
    // `username: e2epropriobeta`, e a execução seguinte morreu no beforeAll com
    // violação de unicidade — um sintoma que não aponta para a causa.
    //
    // Limpar por identificador de negócio sobrevive à chave primária mudar.
    const alvo = {
      OR: [
        { id: { in: [...criados] } },
        { email: { startsWith: TAG } },
        { username: { startsWith: TAG } },
      ],
    };
    await prisma.partnerAccount.deleteMany({ where: { user: alvo } });
    await prisma.user.deleteMany({ where: alvo });
    await app?.close();
  });

  const como = (chave: keyof typeof ids) => ({ Authorization: `Bearer ${tokens[chave]}` });
  const getPerfil = (chave: keyof typeof ids) =>
    request(app.getHttpServer()).get('/users/profile').set(como(chave));
  const patchPerfil = (chave: keyof typeof ids, body: unknown) =>
    request(app.getHttpServer()).patch('/users/profile').set(como(chave)).send(body as never);

  /** Estado do banco, para provar que o PATCH não escreveu além do permitido. */
  const noBanco = (id: string) =>
    prisma.user.findUnique({
      where: { id },
      select: {
        name: true,
        email: true,
        phone: true,
        username: true,
        bio: true,
        isPublic: true,
        roles: true,
        systemRoles: true,
        hasCoachAccess: true,
        hasAthleteAccess: true,
      },
    });

  // ─── Sessão ────────────────────────────────────────────────────────────────

  describe('sessão', () => {
    it('GET sem token → 401 do guard global', async () => {
      const res = await request(app.getHttpServer()).get('/users/profile');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Não autorizado' });
    });

    it('PATCH sem token → 401, e nada é escrito', async () => {
      const antes = await noBanco(ids.A);
      const res = await request(app.getHttpServer())
        .patch('/users/profile')
        .send({ bio: 'invasor' });
      expect(res.status).toBe(401);
      expect(await noBanco(ids.A)).toEqual(antes);
    });

    it('token de usuário apagado → 404 com o contrato em português (D35)', async () => {
      const fantasma = await mint({ id: 'id-que-nao-existe', roles: ['INDIVIDUAL'] });
      const res = await request(app.getHttpServer())
        .get('/users/profile')
        .set({ Authorization: `Bearer ${fantasma}` });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Usuário não encontrado.' });
    });
  });

  // ─── Exposição na saída (D26/D27) ──────────────────────────────────────────

  describe('exposição — partnerAccount recortado (D26)', () => {
    // Propriedade 1 — igualdade de chaves, não lista negra. Com `true` na
    // relação os campos vêm SEM serem nomeados, então "não menciona X" passaria
    // contra o código vulnerável. Foi assim que a fatia 4 quase escapou.
    it('traz exatamente os campos do recorte', async () => {
      const res = await getPerfil('A');
      expect(res.status).toBe(200);
      expect(Object.keys(res.body.partnerAccount).sort()).toEqual(
        Object.keys(OWN_PARTNER_ACCOUNT_SELECT).sort(),
      );
    });

    it('o recorte é o estado da candidatura, e ele chega de verdade', async () => {
      const { body } = await getPerfil('A');
      expect(body.partnerAccount).toMatchObject({
        status: 'rejected',
        rejectionReason: 'motivo visível de propósito',
        stripeAccountStatus: 'restricted',
        payoutsEnabled: false,
        chargesEnabled: false,
      });
    });

    // Propriedade 2
    it('NENHUM valor sentinela do parceiro aparece no corpo', async () => {
      const { body } = await getPerfil('A');
      const corpo = JSON.stringify(body);
      for (const [campo, valor] of Object.entries(SEGREDOS_PARCEIRO)) {
        if (corpo.includes(String(valor))) throw new Error(`vazou ${campo} (${valor})`);
      }
    });

    it.each(['payoutsFrozen', 'allowTestMode', 'commissionRate', 'partnerTier', 'id', 'userId'])(
      'não expõe partnerAccount.%s',
      async (campo) => {
        const { body } = await getPerfil('A');
        expect(body.partnerAccount).not.toHaveProperty(campo);
      },
    );

    // Propriedade 4
    it('usuário sem PartnerAccount → partnerAccount null, não erro', async () => {
      const res = await getPerfil('semParceiro');
      expect(res.status).toBe(200);
      expect(res.body.partnerAccount).toBeNull();
    });
  });

  describe('forma do corpo (D27)', () => {
    // Propriedade 3
    it('_count sai do corpo; stats fica', async () => {
      const { body } = await getPerfil('A');
      expect(body).not.toHaveProperty('_count');
      expect(body.stats).toEqual({
        followers: 0,
        following: 0,
        completionRate: expect.any(Number),
        streak: expect.any(Number),
      });
    });

    it('traz os campos do próprio perfil, inclusive email (é o titular)', async () => {
      const { body } = await getPerfil('A');
      expect(body).toMatchObject({
        id: ids.A,
        email: `${TAG}-A@example.com`,
        username: `${TAG}alfa`,
        bio: 'bio do alfa',
        phone: '(11) 98888-7777',
        isPublic: false,
        systemRoles: ['USER'],
      });
    });
  });

  // ─── Allowlist na entrada (D31/D32) ────────────────────────────────────────

  describe('allowlist na entrada — o eixo novo desta fatia', () => {
    // Propriedade 5
    it('systemRoles no corpo não altera systemRoles no banco', async () => {
      const res = await patchPerfil('B', { systemRoles: ['ADMIN'], bio: 'mudou a bio' });
      expect(res.status).toBe(200);

      const depois = await noBanco(ids.B);
      expect(depois!.systemRoles).toEqual(['USER']);
      expect(depois!.bio).toBe('mudou a bio'); // o campo legítimo passou
    });

    // Propriedade 6
    it("role: 'ADMIN' não entra em roles nem em systemRoles", async () => {
      const res = await patchPerfil('B', { role: 'ADMIN' });
      expect(res.status).toBe(200);

      const depois = await noBanco(ids.B);
      expect(depois!.roles).not.toContain('ADMIN');
      expect(depois!.systemRoles).toEqual(['USER']);
    });

    // Propriedade 7
    it.each([
      ['email', { email: 'invasor@example.com' }],
      ['hasCoachAccess', { hasCoachAccess: true }],
      ['hasAthleteAccess', { hasAthleteAccess: true }],
      ['id', { id: 'outro-id' }],
    ])('%s no corpo é ignorado', async (_campo, body) => {
      const antes = await noBanco(ids.B);
      const res = await patchPerfil('B', body);
      expect(res.status).toBe(200);
      expect(await noBanco(ids.B)).toEqual(antes);
    });

    // Propriedade 8
    it('campo desconhecido no corpo não causa 500', async () => {
      const res = await patchPerfil('B', { campoQueNaoExiste: 'x', outro: { aninhado: 1 } });
      expect(res.status).toBe(200);
    });

    it('corpo vazio é aceito e não muda nada', async () => {
      const antes = await noBanco(ids.B);
      const res = await patchPerfil('B', {});
      expect(res.status).toBe(200);
      expect(await noBanco(ids.B)).toEqual(antes);
    });
  });

  // ─── Posse ─────────────────────────────────────────────────────────────────

  describe('posse — o PATCH só alcança o dono da sessão', () => {
    // Propriedades 9 e 10
    it('token de B não altera A, mesmo mandando o id de A no corpo', async () => {
      const antesA = await noBanco(ids.A);
      const res = await patchPerfil('B', { id: ids.A, bio: 'escrito por B' });
      expect(res.status).toBe(200);

      expect(await noBanco(ids.A)).toEqual(antesA);
      expect((await noBanco(ids.B))!.bio).toBe('escrito por B');
    });

    it('o corpo devolvido é o do dono da sessão', async () => {
      const { body } = await patchPerfil('B', { bio: 'de volta' });
      expect(body.id).toBe(ids.B);
    });
  });

  // ─── Username (D33) ────────────────────────────────────────────────────────

  describe('username', () => {
    const MSG_INVALIDO =
      'Username inválido. Use apenas letras, números e underlines, entre 3 e 20 caracteres.';

    // Propriedade 11
    it.each([
      ['curto demais', 'ab'],
      ['longo demais', 'a'.repeat(21)],
      ['com hífen', 'joao-silva'],
      ['com espaço', 'joao silva'],
      ['com acento', 'josié'],
      ['com ponto', 'joao.silva'],
      ['vazio', ''],
    ])('%s → 400', async (_caso, username) => {
      const res = await patchPerfil('B', { username });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: MSG_INVALIDO });
    });

    // Propriedade 12 — as fronteiras exatas, que o substring(0,20) morto escondia
    it.each([
      ['exatamente 3', 'abc'],
      ['exatamente 20', 'a'.repeat(20)],
      ['só underlines', '___'],
      ['com dígitos', 'user_2026'],
    ])('%s → aceito e gravado inteiro', async (_caso, username) => {
      const res = await patchPerfil('B', { username: `${username}` });
      expect(res.status).toBe(200);
      expect(res.body.username).toBe(username);
      expect((await noBanco(ids.B))!.username).toBe(username);
    });

    // Propriedade 13
    it('username de outra pessoa, diferindo só na capitalização → 409', async () => {
      const res = await patchPerfil('B', { username: `${TAG}ALFA` });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'Este @username já está em uso por outra pessoa.' });
    });

    // Propriedade 14
    it('o próprio username, na mesma capitalização → aceito', async () => {
      await patchPerfil('B', { username: `${TAG}beta` });
      const res = await patchPerfil('B', { username: `${TAG}beta` });
      expect(res.status).toBe(200);
    });

    it('o próprio username, trocando a capitalização → aceito', async () => {
      await patchPerfil('B', { username: `${TAG}beta` });
      const res = await patchPerfil('B', { username: `${TAG}BETA` });
      expect(res.status).toBe(200);
      expect(res.body.username).toBe(`${TAG}BETA`);
      await patchPerfil('B', { username: `${TAG}beta` });
    });
  });

  // ─── Telefone ──────────────────────────────────────────────────────────────

  describe('telefone', () => {
    // Propriedades 16 e 19
    it.each([
      ['11 dígitos crus', '11988887777', '(11) 98888-7777'],
      ['10 dígitos crus', '1133334444', '(11) 3333-4444'],
      ['já formatado', '(21) 99999-8888', '(21) 99999-8888'],
      ['com pontuação solta', '11 9.8888-7777', '(11) 98888-7777'],
      // D44 — reversão do A13. Eu recusei tratar `+55` alegando ambiguidade com o
      // DDD 55 (Santa Maria/RS); a ambiguidade não existe no comprimento (DDD 55
      // dá 10–11 dígitos, código do país dá 12–13). E havia motivo concreto: o
      // onboarding gravava `+55DDDNUMERO`, então esta validação recusava o valor
      // que a própria plataforma gravou, e o treinador não conseguia salvar o
      // perfil por causa de um campo que nunca editou (A25).
      ['com +55 e celular', '+55 (31) 98765-4321', '(31) 98765-4321'],
      ['formato que o onboarding gravava', '+5511988887777', '(11) 98888-7777'],
      ['DDD 55 legítimo, 11 dígitos', '55988887777', '(55) 98888-7777'],
    ])('%s → %s', async (_caso, entrada, esperado) => {
      const res = await patchPerfil('B', { phone: entrada });
      expect(res.status).toBe(200);
      expect(res.body.phone).toBe(esperado);
    });

    // Propriedade 17
    it.each([
      ['9 dígitos', '123456789'],
      ['12 dígitos que não começam com 55', '123456789012'],
      ['13 dígitos que não começam com 55', '1234567890123'],
      ['letras', 'abc'],
    ])(
      '%s → 400',
      async (_caso, phone) => {
        const res = await patchPerfil('B', { phone });
        expect(res.status).toBe(400);
        expect(res.body).toEqual({
          error: 'Telefone inválido. Informe DDD + número (10 ou 11 dígitos).',
        });
      },
    );

    // Propriedade 18
    it.each([['null', null], ['string vazia', ''], ['só espaços', '   ']])(
      '%s → grava null',
      async (_caso, phone) => {
        const res = await patchPerfil('B', { phone });
        expect(res.status).toBe(200);
        expect(res.body.phone).toBeNull();
      },
    );
  });

  // ─── Papel (D30) ───────────────────────────────────────────────────────────

  describe('papel', () => {
    // Propriedade 20
    it('papel válido entra em roles', async () => {
      const res = await patchPerfil('B', { role: 'PROFESSIONAL' });
      expect(res.status).toBe(200);
      expect(res.body.roles).toContain('PROFESSIONAL');
    });

    // Propriedade 21 — a razão de existir do filtro de preservação
    it('papel válido PRESERVA PARTNER_B2B já concedido', async () => {
      const res = await patchPerfil('A', { role: 'PROFESSIONAL' });
      expect(res.status).toBe(200);
      expect(res.body.roles).toContain('PARTNER_B2B');
      expect(res.body.roles).toContain('PROFESSIONAL');
      expect(res.body.roles).not.toContain('INDIVIDUAL'); // trocou de papel de produto
    });

    it('trocar de papel não acumula papéis de produto', async () => {
      await patchPerfil('B', { role: 'INDIVIDUAL' });
      const res = await patchPerfil('B', { role: 'CLIENT' });
      expect(res.body.roles.filter((r: string) => r === 'INDIVIDUAL')).toHaveLength(0);
      expect(res.body.roles).toContain('CLIENT');
    });

    /**
     * `AFFILIATE` merece caso próprio: era o único papel que a rota
     * `PATCH /api/user/update-role` concedia e esta não, e foi o motivo dela ser
     * apagada (D36 de epic-nest-papeis.md). Conceder o papel aqui daria um papel
     * SEM a `AffiliateAccount`, e os endpoints de afiliado responderiam 404.
     * Quem concede afiliado é `POST /api/onboarding`, que cria a conta junto.
     */
    it('AFFILIATE → 200 e NÃO concede o papel (diferença deliberada, D36)', async () => {
      const antes = (await noBanco(ids.B))!.roles;
      const res = await patchPerfil('B', { role: 'AFFILIATE' });

      expect(res.status).toBe(200);
      expect(res.body.roles).not.toContain('AFFILIATE');
      expect((await noBanco(ids.B))!.roles).toEqual(antes);
    });

    // Propriedade 22 — peculiaridade preservada de propósito (D30)
    it.each([
      ['inexistente', 'SUPER_ADMIN'],
      ['PARTNER_B2B', 'PARTNER_B2B'],
      ['BOTH legado', 'BOTH'],
      ['AFFILIATE', 'AFFILIATE'],
    ])(
      'papel %s → 200 e roles intacto, sem erro',
      async (_caso, role) => {
        const antes = (await noBanco(ids.B))!.roles;
        const res = await patchPerfil('B', { role });
        expect(res.status).toBe(200);
        expect((await noBanco(ids.B))!.roles).toEqual(antes);
      },
    );
  });

  // ─── Nome (D34) ────────────────────────────────────────────────────────────

  describe('nome', () => {
    // Propriedade 23
    it('trima e corta em 50', async () => {
      const res = await patchPerfil('B', { name: `   ${'n'.repeat(60)}   ` });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('n'.repeat(50));
    });

    // Propriedade 24
    it('nome vazio com id_token do Google restaura o nome do payload', async () => {
      await prisma.account.create({
        data: {
          userId: ids.B,
          type: 'oauth',
          provider: 'google',
          providerAccountId: `${TAG}-google-b`,
          id_token: fakeGoogleIdToken({ name: 'Nome Vindo do Google' }),
        },
      });

      const res = await patchPerfil('B', { name: '' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Nome Vindo do Google');

      await prisma.account.deleteMany({ where: { userId: ids.B } });
    });

    // Propriedade 27
    it('id_token corrompido cai no fallback em vez de 500', async () => {
      await prisma.account.create({
        data: {
          userId: ids.B,
          type: 'oauth',
          provider: 'google',
          providerAccountId: `${TAG}-google-b-ruim`,
          id_token: 'isto.nao-e-base64-valido.nada',
        },
      });

      const res = await patchPerfil('B', { name: '' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe(`${TAG}-B`); // prefixo do email

      await prisma.account.deleteMany({ where: { userId: ids.B } });
    });

    // Propriedade 25
    it('nome vazio sem id_token → prefixo do email', async () => {
      const res = await patchPerfil('B', { name: '' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe(`${TAG}-B`);
    });

    // Propriedade 26
    it('nome vazio sem id_token e sem email → "Usuário"', async () => {
      const res = await patchPerfil('semEmail', { name: '' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Usuário');
    });
  });

  // ─── Gamificação (D28) — o teste de regressão do A12 ───────────────────────

  describe('gamificação', () => {
    // Propriedades 28 e 29 — o coração da fatia.
    //
    // Fixture: 300 concluídas (7 em dias consecutivos até hoje + 293 num só dia
    // 30 dias atrás) e 500 nunca concluídas. Total 800.
    //
    //   correta            → 300/800 = 38%, streak 7
    //   legado (A12)       →   0%, streak 0   — os 500 nulls ocupam o take:500
    //   só `nulls: 'last'` →  60%, streak 7   — 300 completas + 200 nulls = 500
    //
    // Os três resultados são distintos de propósito: o teste reprova o legado E
    // reprova a correção pela metade.
    it('streak 7 e taxa 38% mesmo com 500 sessões nunca concluídas', async () => {
      const { body } = await getPerfil('gamer');
      expect(body.stats.streak).toBe(7);
      expect(body.stats.completionRate).toBe(38);
    });

    it('a fixture é a que a spec descreve (âncora do cálculo acima)', async () => {
      const [total, completas, incompletas] = await Promise.all([
        prisma.trainingSession.count({ where: { planId: planoGamerId } }),
        prisma.trainingSession.count({ where: { planId: planoGamerId, completed: true } }),
        prisma.trainingSession.count({ where: { planId: planoGamerId, completed: false } }),
      ]);
      expect({ total, completas, incompletas }).toEqual({
        total: 800,
        completas: 300,
        incompletas: 500,
      });
    });

    // Propriedade 33
    it('conta sessões alcançadas por student.userId, não só por athleteId', async () => {
      const { body } = await getPerfil('B');
      expect(body.stats.completionRate).toBe(50); // 1 de 2
      expect(body.stats.streak).toBe(1); // concluída ontem
    });

    // Propriedade 34
    it('sem nenhuma sessão → zeros, sem divisão por zero', async () => {
      const { body } = await getPerfil('semParceiro');
      expect(body.stats.completionRate).toBe(0);
      expect(body.stats.streak).toBe(0);
    });

    // Propriedade 31 — streak só conta se o último treino foi hoje ou ontem
    it('último treino há 3 dias → streak 0', async () => {
      const plano = await prisma.trainingPlan.create({
        data: {
          title: `${TAG}-plano-frio`,
          aiSuggestion: '{}',
          athleteId: ids.semEmail,
          segment: 'COACH',
        },
      });
      const d = new Date();
      d.setDate(d.getDate() - 3);
      d.setHours(9, 0, 0, 0);
      await prisma.trainingSession.create({
        data: {
          planId: plano.id,
          day: 1,
          title: `${TAG}-frio`,
          completed: true,
          completedAt: d,
        },
      });

      const { body } = await getPerfil('semEmail');
      expect(body.stats.streak).toBe(0);
      expect(body.stats.completionRate).toBe(100); // a taxa não depende da recência
    });

    // Propriedade 32
    it('várias sessões no mesmo dia contam como um dia só', async () => {
      const plano = await prisma.trainingPlan.create({
        data: {
          title: `${TAG}-plano-triplo`,
          aiSuggestion: '{}',
          athleteId: ids.trainer,
          segment: 'COACH',
        },
      });
      const hoje = new Date();
      hoje.setHours(7, 0, 0, 0);
      await prisma.trainingSession.createMany({
        data: [7, 12, 19].map((h, i) => {
          const d = new Date(hoje);
          d.setHours(h);
          return {
            planId: plano.id,
            day: i + 1,
            title: `${TAG}-triplo-${i}`,
            completed: true,
            completedAt: d,
          };
        }) as never,
      });

      const { body } = await getPerfil('trainer');
      expect(body.stats.streak).toBe(1);
    });
  });
});
