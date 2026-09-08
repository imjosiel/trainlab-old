import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { encode } from 'next-auth/jwt';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma/prisma.service';

const SECRET = 'e2e-secret-nao-usado-em-producao';
const TAG = 'e2e-msg';

function mint(claims: Record<string, unknown>): Promise<string> {
  return encode({ token: claims, secret: SECRET });
}

/**
 * Fatia 12 — mensagens. Spec: docs/implementation-plans/epic-nest-mensagens.md
 *
 * O achado central (A50) é sobre um usuário com DOIS papéis vendo — ou não — as
 * conversas dos dois lados. Isso não se prova com Prisma mockado: quem devolve
 * as linhas é o mock, então o filtro nunca é exercido de verdade. Por isso aqui
 * existem três usuários reais e conversas reais nos dois sentidos.
 */
describe('/conversations (e2e, Postgres real)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  /** Papéis PROFESSIONAL + CLIENT — o estado que o A50 deixa meio invisível. */
  let duplo: string;
  let profissional: string;
  let terceiro: string;

  let tokenDuplo: string;
  let tokenProfissional: string;
  let tokenTerceiro: string;

  /** duplo é o PROFISSIONAL — o legado enxerga. */
  let convComoProfissional: string;
  /** duplo é o CLIENTE — o legado NÃO enxerga. */
  let convComoCliente: string;
  /** Entre dois terceiros — ninguém de fora enxerga. */
  let convAlheia: string;

  const usuarios = new Set<string>();

  beforeAll(async () => {
    process.env.NEXTAUTH_SECRET = SECRET;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const criar = async (sufixo: string, roles: string[]) => {
      const u = await prisma.user.create({
        data: {
          email: `${TAG}-${sufixo}@example.com`,
          name: `Usuário ${sufixo}`,
          roles: roles as never,
        },
      });
      usuarios.add(u.id);
      return u;
    };

    const d = await criar('duplo', ['PROFESSIONAL', 'CLIENT']);
    const p = await criar('prof', ['PROFESSIONAL']);
    const t = await criar('terceiro', ['CLIENT']);

    duplo = d.id;
    profissional = p.id;
    terceiro = t.id;

    tokenDuplo = await mint({
      id: duplo,
      email: d.email,
      roles: ['PROFESSIONAL', 'CLIENT'],
      systemRoles: ['USER'],
    });
    tokenProfissional = await mint({
      id: profissional,
      email: p.email,
      roles: ['PROFESSIONAL'],
      systemRoles: ['USER'],
    });
    tokenTerceiro = await mint({
      id: terceiro,
      email: t.email,
      roles: ['CLIENT'],
      systemRoles: ['USER'],
    });

    const c1 = await prisma.conversation.create({
      data: { trainerId: duplo, studentId: terceiro, lastMessageAt: new Date('2026-01-02') },
    });
    const c2 = await prisma.conversation.create({
      data: { trainerId: profissional, studentId: duplo, lastMessageAt: new Date('2026-01-01') },
    });
    const c3 = await prisma.conversation.create({
      data: { trainerId: profissional, studentId: terceiro, lastMessageAt: new Date('2026-01-03') },
    });

    convComoProfissional = c1.id;
    convComoCliente = c2.id;
    convAlheia = c3.id;
  });

  afterAll(async () => {
    await prisma.message.deleteMany({ where: { senderId: { in: [...usuarios] } } });
    await prisma.conversation.deleteMany({
      where: {
        OR: [{ trainerId: { in: [...usuarios] } }, { studentId: { in: [...usuarios] } }],
      },
    });
    await prisma.user.deleteMany({ where: { id: { in: [...usuarios] } } });
    await app?.close();
  });

  const comoDuplo = () => ({ Authorization: `Bearer ${tokenDuplo}` });
  const comoProfissional = () => ({ Authorization: `Bearer ${tokenProfissional}` });
  const comoTerceiro = () => ({ Authorization: `Bearer ${tokenTerceiro}` });

  const http = () => request(app.getHttpServer());

  /* ────────────────────────────────────────────────────────────────────────── */

  describe('autenticação', () => {
    it('GET /conversations sem sessão → 401', async () => {
      const res = await http().get('/conversations');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Não autorizado' });
    });

    it('POST /conversations/:id/messages sem sessão → 401', async () => {
      const res = await http().post(`/conversations/${convComoCliente}/messages`).send({ content: 'oi' });
      expect(res.status).toBe(401);
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * A50 — o coração desta fatia
   * ────────────────────────────────────────────────────────────────────────── */

  describe('A50 — usuário com PROFESSIONAL e CLIENT vê os dois lados', () => {
    it('a lista traz a conversa em que ele é profissional', async () => {
      const res = await http().get('/conversations').set(comoDuplo());

      expect(res.status).toBe(200);
      const ids = res.body.conversations.map((c: { id: string }) => c.id);
      expect(ids).toContain(convComoProfissional);
    });

    // ESTA é a que o legado reprova. Se ela passar sozinha, ainda pode ser
    // acidente de fixture — daí a de cima e a de baixo.
    it('a lista traz a conversa em que ele é CLIENTE', async () => {
      const res = await http().get('/conversations').set(comoDuplo());

      const ids = res.body.conversations.map((c: { id: string }) => c.id);
      expect(ids).toContain(convComoCliente);
    });

    it('a lista NÃO traz conversa entre dois terceiros', async () => {
      const res = await http().get('/conversations').set(comoDuplo());

      const ids = res.body.conversations.map((c: { id: string }) => c.id);
      expect(ids).not.toContain(convAlheia);
    });

    it('quem tem um papel só continua vendo exatamente o que via — paridade', async () => {
      const res = await http().get('/conversations').set(comoProfissional());

      const ids = res.body.conversations.map((c: { id: string }) => c.id);
      expect(ids).toEqual(expect.arrayContaining([convComoCliente, convAlheia]));
      expect(ids).not.toContain(convComoProfissional);
    });

    it('ordena por lastMessageAt desc', async () => {
      const res = await http().get('/conversations').set(comoProfissional());

      const ids = res.body.conversations.map((c: { id: string }) => c.id);
      expect(ids.indexOf(convAlheia)).toBeLessThan(ids.indexOf(convComoCliente));
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * Posse
   * ────────────────────────────────────────────────────────────────────────── */

  /**
   * A55 — 404 de posse é indistinguível de 404 de rota inexistente.
   *
   * Na primeira execução vermelha, os cinco testes que afirmavam 404 PASSARAM —
   * porque nenhuma rota existia ainda e o Nest devolve 404 para caminho
   * desconhecido. "Conversa alheia rejeitada" e "endpoint não implementado" dão
   * a mesma resposta, então a asserção sozinha não prova posse nenhuma.
   *
   * Cada 404 abaixo vai PAREADO com um caso legítimo que exige 200/201. O par
   * positivo é o que prova que a rota existe; sem ele o teste passa no vazio.
   */
  describe('posse — conversa alheia é indistinguível de inexistente', () => {
    it('GET mensagens: a minha → 200, a alheia → 404', async () => {
      const minha = await http().get(`/conversations/${convComoCliente}/messages`).set(comoDuplo());
      const alheia = await http().get(`/conversations/${convAlheia}/messages`).set(comoDuplo());

      expect(minha.status).toBe(200);
      expect(alheia.status).toBe(404);
    });

    it('POST mensagem: na minha grava, na alheia → 404 sem gravar', async () => {
      const antes = await prisma.message.count({ where: { conversationId: convAlheia } });

      const minha = await http()
        .post(`/conversations/${convComoCliente}/messages`)
        .set(comoDuplo())
        .send({ content: `${TAG} legítima` });
      const alheia = await http()
        .post(`/conversations/${convAlheia}/messages`)
        .set(comoDuplo())
        .send({ content: `${TAG} invasão` });

      expect(minha.status).toBe(201);
      expect(alheia.status).toBe(404);
      expect(await prisma.message.count({ where: { conversationId: convAlheia } })).toBe(antes);
    });

    it('PATCH read: na minha → 200, na alheia → 404', async () => {
      const minha = await http().patch(`/conversations/${convComoCliente}/read`).set(comoDuplo());
      const alheia = await http().patch(`/conversations/${convAlheia}/read`).set(comoDuplo());

      expect(minha.status).toBe(200);
      expect(alheia.status).toBe(404);
    });

    it('conversa inexistente responde igual à alheia — e ambas diferem da minha', async () => {
      const minha = await http().get(`/conversations/${convComoCliente}/messages`).set(comoDuplo());
      const alheia = await http().get(`/conversations/${convAlheia}/messages`).set(comoDuplo());
      const fantasma = await http().get('/conversations/nao-existe/messages').set(comoDuplo());

      expect(minha.status).toBe(200);
      expect(fantasma.status).toBe(alheia.status);
      expect(fantasma.body).toEqual(alheia.body);
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * Envio e leitura
   * ────────────────────────────────────────────────────────────────────────── */

  describe('envio', () => {
    it('grava a mensagem e devolve o remetente embutido', async () => {
      const res = await http()
        .post(`/conversations/${convComoCliente}/messages`)
        .set(comoDuplo())
        .send({ content: `  ${TAG} com espaços  ` });

      expect(res.status).toBe(201);
      expect(res.body.message.content).toBe(`${TAG} com espaços`);
      expect(res.body.message.sender.id).toBe(duplo);
    });

    it('atualiza lastMessageAt da conversa', async () => {
      const antes = await prisma.conversation.findUnique({ where: { id: convComoCliente } });

      await http()
        .post(`/conversations/${convComoCliente}/messages`)
        .set(comoDuplo())
        .send({ content: `${TAG} toque` });

      const depois = await prisma.conversation.findUnique({ where: { id: convComoCliente } });
      expect(depois!.lastMessageAt!.getTime()).toBeGreaterThan(antes!.lastMessageAt!.getTime());
    });

    it('conteúdo em branco → 400', async () => {
      const res = await http()
        .post(`/conversations/${convComoCliente}/messages`)
        .set(comoDuplo())
        .send({ content: '   ' });

      expect(res.status).toBe(400);
    });
  });

  describe('leitura', () => {
    it('marca as da outra pessoa e deixa as minhas intactas', async () => {
      const minha = await prisma.message.create({
        data: { conversationId: convComoCliente, senderId: duplo, content: `${TAG} minha` },
      });
      const dele = await prisma.message.create({
        data: { conversationId: convComoCliente, senderId: profissional, content: `${TAG} dele` },
      });

      const res = await http().patch(`/conversations/${convComoCliente}/read`).set(comoDuplo());
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });

      const depoisMinha = await prisma.message.findUnique({ where: { id: minha.id } });
      const depoisDele = await prisma.message.findUnique({ where: { id: dele.id } });

      // Anti-vacuidade: "a minha continua não lida" só vale se a dele mudou.
      expect(depoisDele!.readAt).not.toBeNull();
      expect(depoisMinha!.readAt).toBeNull();
    });

    it('o unreadCount da lista cai depois de marcar', async () => {
      await prisma.message.create({
        data: { conversationId: convComoCliente, senderId: profissional, content: `${TAG} nova` },
      });

      const antes = await http().get('/conversations').set(comoDuplo());
      const naLista = (r: request.Response) =>
        r.body.conversations.find((c: { id: string }) => c.id === convComoCliente);
      expect(naLista(antes).unreadCount).toBeGreaterThan(0);

      await http().patch(`/conversations/${convComoCliente}/read`).set(comoDuplo());

      const depois = await http().get('/conversations').set(comoDuplo());
      expect(naLista(depois).unreadCount).toBe(0);
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * Paginação de mensagens — o caso que o cursor por campo não-único quebra
   * ────────────────────────────────────────────────────────────────────────── */

  describe('paginação de mensagens', () => {
    it('não pula nem repete com createdAt idêntico', async () => {
      const mesmoInstante = new Date('2026-03-01T12:00:00.000Z');
      const criadas: string[] = [];
      for (let i = 0; i < 6; i++) {
        const m = await prisma.message.create({
          data: {
            conversationId: convComoProfissional,
            senderId: duplo,
            content: `${TAG} pag ${i}`,
            createdAt: mesmoInstante,
          },
        });
        criadas.push(m.id);
      }

      const p1 = await http()
        .get(`/conversations/${convComoProfissional}/messages`)
        .set(comoDuplo());
      const idsP1: string[] = p1.body.messages.map((m: { id: string }) => m.id);

      const maisAntiga = idsP1[0];
      const p2 = await http()
        .get(`/conversations/${convComoProfissional}/messages?before=${maisAntiga}`)
        .set(comoDuplo());
      const idsP2: string[] = p2.body.messages.map((m: { id: string }) => m.id);

      // Sem repetição entre as páginas...
      expect(idsP1.filter((id) => idsP2.includes(id))).toEqual([]);
      // ...e sem buraco: a união cobre tudo que foi criado.
      const uniao = new Set([...idsP1, ...idsP2]);
      criadas.forEach((id) => expect(uniao.has(id)).toBe(true));
    });

    it('devolve as mais antigas primeiro dentro da página', async () => {
      const res = await http()
        .get(`/conversations/${convComoProfissional}/messages`)
        .set(comoDuplo());

      const ids: string[] = res.body.messages.map((m: { id: string }) => m.id);
      expect([...ids].sort()).toEqual(ids);
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * D63 — o pouco que entra do A52
   * ────────────────────────────────────────────────────────────────────────── */

  describe('criação de conversa (D63)', () => {
    it('recupera a existente em vez de duplicar', async () => {
      const res = await http()
        .post('/conversations')
        .set(comoDuplo())
        .send({ trainerId: duplo, studentId: terceiro });

      expect(res.status).toBe(201);
      expect(res.body.conversation.id).toBe(convComoProfissional);
    });

    it('quem não é participante → 403', async () => {
      const res = await http()
        .post('/conversations')
        .set(comoTerceiro())
        .send({ trainerId: duplo, studentId: profissional });

      expect(res.status).toBe(403);
    });

    it('consigo mesmo → 400', async () => {
      const res = await http()
        .post('/conversations')
        .set(comoDuplo())
        .send({ trainerId: duplo, studentId: duplo });

      expect(res.status).toBe(400);
    });

    // Pareado pelo mesmo motivo do A55: 404 sozinho aqui também passaria com a
    // rota ausente.
    it('outro participante inexistente → 404 (não 500), enquanto o existente → 201', async () => {
      const existente = await http()
        .post('/conversations')
        .set(comoDuplo())
        .send({ trainerId: duplo, studentId: terceiro });
      const fantasma = await http()
        .post('/conversations')
        .set(comoDuplo())
        .send({ trainerId: duplo, studentId: 'usuario-que-nao-existe' });

      expect(existente.status).toBe(201);
      expect(fantasma.status).toBe(404);
    });
  });
});
