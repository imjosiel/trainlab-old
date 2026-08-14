import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';

import { SessionPayload } from '@/auth/session-payload';
import { AppointmentsService } from './appointments.service';

/* ────────────────────────────────────────────────────────────────────────────
 * Mocks
 * ──────────────────────────────────────────────────────────────────────────── */

function prismaMock() {
  return {
    appointment: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    student: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    trainerAthlete: { findFirst: jest.fn() },
  };
}

function calendarMock() {
  return {
    criarEvento: jest.fn().mockResolvedValue({ meetLink: 'https://meet.example/xyz', eventId: 'ev-1' }),
    atualizarEvento: jest.fn().mockResolvedValue(undefined),
    apagarEvento: jest.fn().mockResolvedValue(undefined),
  };
}

function notificationsMock() {
  return { criar: jest.fn().mockResolvedValue({ id: 'notif-1' }) };
}

type PrismaMock = ReturnType<typeof prismaMock>;

async function bodyOfRejection(promise: Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    await promise;
    throw new Error('esperava rejeição, mas resolveu');
  } catch (err) {
    if (!(err instanceof HttpException)) throw err;
    return err.getResponse() as Record<string, unknown>;
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Interpretador de filtro — o que torna o teste do A57 não-vacuoso
 *
 * Afirmar o FORMATO do `where` prova que o objeto tem certa cara, não que ele
 * ALCANÇA o agendamento que hoje some da agenda. Este avaliador roda o filtro
 * contra linhas de verdade, e o teste primeiro demonstra que ele REPROVA a regra
 * legada. É a mesma técnica da fatia 12, e ela existe porque a família A39/A40/
 * A45/A46/A55 já custou cinco testes que passavam sem exercitar nada.
 * ──────────────────────────────────────────────────────────────────────────── */

interface Linha {
  id: string;
  trainerId: string;
  athleteId?: string | null;
  student?: { userId?: string | null } | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function filtroAlcanca(where: any, linha: Linha): boolean {
  if (!where) return true;
  if (Array.isArray(where.OR)) return where.OR.some((c: unknown) => filtroAlcanca(c, linha));

  return Object.entries(where).every(([campo, valor]) => {
    if (campo === 'OR') return true;
    // `student: { userId: X }` — filtro sobre a relação
    if (campo === 'student' && valor && typeof valor === 'object') {
      const esperado = (valor as { userId?: string }).userId;
      return linha.student?.userId === esperado;
    }
    return (linha as unknown as Record<string, unknown>)[campo] === valor;
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Cenário
 * ──────────────────────────────────────────────────────────────────────────── */

const EU = 'user-duplo';
const OUTRO = 'user-outro';
const TERCEIRO = 'user-terceiro';
const APT = 'apt-1';

function sessao(over: Partial<SessionPayload> = {}): SessionPayload {
  return {
    id: EU,
    name: null,
    email: 'duplo@example.com',
    image: null,
    roles: ['PROFESSIONAL', 'CLIENT'],
    systemRoles: ['USER'],
    isAdmin: false,
    subscriptionStatus: null,
    subscriptionPlan: null,
    stripeCustomerId: null,
    ...over,
  };
}

/** EU marquei — sou o profissional. O legado enxerga. */
const MARQUEI: Linha = { id: 'a-prof', trainerId: EU, athleteId: OUTRO };
/** Marcaram PARA MIM como atleta B2C. O legado NÃO enxerga — é o A57. */
const MARCARAM_ATLETA: Linha = { id: 'a-atleta', trainerId: OUTRO, athleteId: EU };
/** Marcaram PARA MIM como aluno B2B, via Student. Também some. */
const MARCARAM_ALUNO: Linha = { id: 'a-aluno', trainerId: OUTRO, athleteId: null, student: { userId: EU } };
/** Entre terceiros. */
const ALHEIO: Linha = { id: 'a-alheio', trainerId: OUTRO, athleteId: TERCEIRO };

/** A regra do legado, escrita aqui para servir de controle. */
const FILTRO_LEGADO_QUANDO_PROFISSIONAL = { trainerId: EU };

describe('AppointmentsService', () => {
  let prisma: PrismaMock;
  let calendar: ReturnType<typeof calendarMock>;
  let notifications: ReturnType<typeof notificationsMock>;
  let service: AppointmentsService;

  beforeEach(() => {
    prisma = prismaMock();
    calendar = calendarMock();
    notifications = notificationsMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AppointmentsService(prisma as any, calendar as any, notifications as any);

    prisma.appointment.findMany.mockResolvedValue([]);
    prisma.appointment.count.mockResolvedValue(0);
    prisma.appointment.create.mockResolvedValue({ id: APT, title: 'x', scheduledAt: new Date(), athleteId: OUTRO, student: null });
    prisma.appointment.update.mockResolvedValue({ id: APT });
    prisma.appointment.updateMany.mockResolvedValue({ count: 1 });
    prisma.appointment.findUnique.mockResolvedValue({
      id: APT, trainerId: EU, athleteId: OUTRO, student: null,
      scheduledAt: new Date('2099-01-01'), status: 'PENDING', googleEventId: null, title: 'x',
    });
    prisma.trainerAthlete.findFirst.mockResolvedValue({ athleteId: OUTRO });
    prisma.student.findUnique.mockResolvedValue({ trainerId: EU, userId: OUTRO, email: 'a@b.c' });
    prisma.user.findUnique.mockResolvedValue({ email: 'a@b.c' });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * D64 — participação, não papel
   * ────────────────────────────────────────────────────────────────────────── */

  describe('list — participação nos dois lados (D64, corrige A57)', () => {
    // CONTROLE. Se falhar, o avaliador não discrimina e o bloco inteiro é vacuoso.
    it('[controle] a regra legada por papel NÃO alcança o que marcaram para mim', () => {
      expect(filtroAlcanca(FILTRO_LEGADO_QUANDO_PROFISSIONAL, MARQUEI)).toBe(true);
      expect(filtroAlcanca(FILTRO_LEGADO_QUANDO_PROFISSIONAL, MARCARAM_ATLETA)).toBe(false);
      expect(filtroAlcanca(FILTRO_LEGADO_QUANDO_PROFISSIONAL, MARCARAM_ALUNO)).toBe(false);
    });

    it('alcança o que EU marquei', async () => {
      await service.list(sessao(), {});
      const { where } = prisma.appointment.findMany.mock.calls[0][0];
      expect(filtroAlcanca(where, MARQUEI)).toBe(true);
    });

    it('alcança o que marcaram para mim como atleta B2C', async () => {
      await service.list(sessao(), {});
      const { where } = prisma.appointment.findMany.mock.calls[0][0];
      expect(filtroAlcanca(where, MARCARAM_ATLETA)).toBe(true);
    });

    it('alcança o que marcaram para mim como aluno B2B', async () => {
      await service.list(sessao(), {});
      const { where } = prisma.appointment.findMany.mock.calls[0][0];
      expect(filtroAlcanca(where, MARCARAM_ALUNO)).toBe(true);
    });

    it('NÃO alcança agendamento entre terceiros', async () => {
      await service.list(sessao(), {});
      const { where } = prisma.appointment.findMany.mock.calls[0][0];
      expect(filtroAlcanca(where, ALHEIO)).toBe(false);
    });

    it('o papel do requisitante não entra na consulta', async () => {
      await service.list(sessao(), {});
      const chamada = JSON.stringify(prisma.appointment.findMany.mock.calls[0][0]);
      expect(chamada).not.toMatch(/PROFESSIONAL|CLIENT|INDIVIDUAL|roles/);
    });

    it('a contagem usa o MESMO filtro da busca — senão total mente', async () => {
      await service.list(sessao(), {});
      const daBusca = prisma.appointment.findMany.mock.calls[0][0].where;
      const daContagem = prisma.appointment.count.mock.calls[0][0].where;
      expect(daContagem).toEqual(daBusca);
    });

    it('admin com trainerId vê a agenda daquele profissional', async () => {
      await service.list(sessao({ isAdmin: true, systemRoles: ['ADMIN'] }), { trainerId: OUTRO });
      const { where } = prisma.appointment.findMany.mock.calls[0][0];
      expect(where).toEqual(expect.objectContaining({ trainerId: OUTRO }));
    });

    it('NÃO-admin passando trainerId é ignorado — não vira escalada', async () => {
      await service.list(sessao(), { trainerId: OUTRO });
      const { where } = prisma.appointment.findMany.mock.calls[0][0];
      expect(filtroAlcanca(where, ALHEIO)).toBe(false);
    });
  });

  describe('list — filtros e paginação', () => {
    it('status fora do enum → 400', async () => {
      await expect(service.list(sessao(), { status: 'DELETADO' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it.each([['from'], ['to']])('%s inválido → 400', async (campo) => {
      await expect(service.list(sessao(), { [campo]: 'nao-e-data' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ordena por scheduledAt crescente', async () => {
      await service.list(sessao(), {});
      expect(prisma.appointment.findMany.mock.calls[0][0].orderBy).toEqual({ scheduledAt: 'asc' });
    });

    it('pages sai da contagem, não do tamanho da página', async () => {
      prisma.appointment.count.mockResolvedValue(51);
      const r = await service.list(sessao(), {});
      expect(r.total).toBe(51);
      expect(r.pages).toBe(2);
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * A59 / D66 — ordem: validar, gravar, e só então o mundo externo
   * ────────────────────────────────────────────────────────────────────────── */

  describe('create — nada externo antes da validação (corrige A59)', () => {
    const valido = {
      title: 'Sessão',
      scheduledAt: '2099-01-01T10:00:00.000Z',
      athleteId: OUTRO,
      createMeet: true,
    };

    it.each([
      ['sem title', { ...valido, title: undefined }],
      ['sem scheduledAt', { ...valido, scheduledAt: undefined }],
      ['scheduledAt inválido', { ...valido, scheduledAt: 'ontem' }],
      ['sem studentId nem athleteId', { ...valido, athleteId: undefined, studentId: undefined }],
      ['title acima de 150', { ...valido, title: 'a'.repeat(151) }],
    ])('%s → 400 e o Google NÃO é chamado', async (_rotulo, body) => {
      await expect(service.create(sessao(), body)).rejects.toBeInstanceOf(BadRequestException);
      expect(calendar.criarEvento).not.toHaveBeenCalled();
    });

    // CONTROLE do bloco acima: prova que com corpo válido o Google É chamado.
    // Sem ele, um serviço que nunca chama o calendário passaria em tudo.
    it('[controle] com corpo válido e createMeet, o Google É chamado', async () => {
      await service.create(sessao(), valido);
      expect(calendar.criarEvento).toHaveBeenCalled();
    });

    it('sem createMeet, o Google não é chamado', async () => {
      await service.create(sessao(), { ...valido, createMeet: false });
      expect(calendar.criarEvento).not.toHaveBeenCalled();
    });

    it('quem não é profissional nem admin → 403, sem tocar no Google', async () => {
      await expect(
        service.create(sessao({ roles: ['CLIENT'] }), valido),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(calendar.criarEvento).not.toHaveBeenCalled();
    });

    it('falha do Google não derruba a criação, e sinaliza meetNotAvailable', async () => {
      calendar.criarEvento.mockRejectedValue(new Error('calendar fora do ar'));

      const r = await service.create(sessao(), valido);

      expect(r.appointment).toEqual(expect.objectContaining({ id: APT }));
      expect(r.meetNotAvailable).toBe(true);
    });

    it('Google indisponível (sem credencial) devolve meetNotAvailable sem erro', async () => {
      calendar.criarEvento.mockResolvedValue(null);
      const r = await service.create(sessao(), valido);
      expect(r.meetNotAvailable).toBe(true);
    });
  });

  describe('create — posse do participante (IDOR)', () => {
    const base = { title: 'x', scheduledAt: '2099-01-01T10:00:00.000Z' };

    it('aluno de outro profissional → 403', async () => {
      prisma.student.findUnique.mockResolvedValue({ trainerId: TERCEIRO, userId: OUTRO });
      await expect(service.create(sessao(), { ...base, studentId: 's-1' })).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it('aluno inexistente → 404', async () => {
      prisma.student.findUnique.mockResolvedValue(null);
      await expect(service.create(sessao(), { ...base, studentId: 's-1' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('atleta sem vínculo → 403', async () => {
      prisma.trainerAthlete.findFirst.mockResolvedValue(null);
      await expect(service.create(sessao(), { ...base, athleteId: OUTRO })).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it('[controle] com vínculo, cria', async () => {
      await service.create(sessao(), { ...base, athleteId: OUTRO });
      expect(prisma.appointment.create).toHaveBeenCalled();
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * D70 — notificação criada no Nest precisa emitir o push
   * ────────────────────────────────────────────────────────────────────────── */

  describe('create — notificação (D70, e A60)', () => {
    const base = { title: 'Sessão', scheduledAt: '2099-01-01T10:00:00.000Z' };

    it('notifica o atleta B2C', async () => {
      prisma.appointment.create.mockResolvedValue({ id: APT, title: 'Sessão', scheduledAt: new Date(), athleteId: OUTRO, student: null });

      await service.create(sessao(), { ...base, athleteId: OUTRO });

      expect(notifications.criar).toHaveBeenCalledWith(expect.objectContaining({ userId: OUTRO }));
    });

    it('notifica o usuário por trás do aluno B2B', async () => {
      prisma.appointment.create.mockResolvedValue({
        id: APT, title: 'Sessão', scheduledAt: new Date(), athleteId: null,
        student: { user: { id: TERCEIRO } },
      });

      await service.create(sessao(), { ...base, studentId: 's-1' });

      expect(notifications.criar).toHaveBeenCalledWith(expect.objectContaining({ userId: TERCEIRO }));
    });

    it('falha ao notificar não derruba a criação', async () => {
      notifications.criar.mockRejectedValue(new Error('sino fora do ar'));

      const r = await service.create(sessao(), { ...base, athleteId: OUTRO });

      expect(r.appointment).toEqual(expect.objectContaining({ id: APT }));
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * update
   * ────────────────────────────────────────────────────────────────────────── */

  describe('update — quem pode o quê', () => {
    it('quem não participa → 403', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: APT, trainerId: TERCEIRO, athleteId: null, student: null, status: 'PENDING', scheduledAt: new Date('2099-01-01'),
      });
      await expect(service.update(APT, sessao(), { status: 'CANCELED' })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('inexistente → 404', async () => {
      prisma.appointment.findUnique.mockResolvedValue(null);
      await expect(service.update(APT, sessao(), {})).rejects.toBeInstanceOf(NotFoundException);
    });

    it('atendido só confirma ou cancela — outro status é 400', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: APT, trainerId: OUTRO, athleteId: EU, student: null, status: 'PENDING', scheduledAt: new Date('2099-01-01'),
      });
      await expect(service.update(APT, sessao(), { status: 'COMPLETED' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('[controle] atendido consegue confirmar', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: APT, trainerId: OUTRO, athleteId: EU, student: null, status: 'PENDING', scheduledAt: new Date('2099-01-01'),
      });
      await expect(service.update(APT, sessao(), { status: 'CONFIRMED' })).resolves.toBeDefined();
    });

    // A63 — este teste passou na PRIMEIRA execução vermelha, com o serviço
    // lançando "não implementado". O `.catch(() => {})` engolia a exceção e o
    // `?? {}` transformava "nenhuma chamada aconteceu" em "chamada sem title".
    // Duas rotas para o mesmo verde, e a errada não exercitava nada.
    //
    // Agora a asserção positiva vem primeiro: o update TEM que ter acontecido.
    it('atendido confirma, mas o title do corpo é ignorado', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: APT, trainerId: OUTRO, athleteId: EU, student: null, status: 'PENDING', scheduledAt: new Date('2099-01-01'),
      });

      await service.update(APT, sessao(), { status: 'CONFIRMED', title: 'invadido' });

      expect(prisma.appointment.update).toHaveBeenCalledTimes(1);
      const { data } = prisma.appointment.update.mock.calls[0][0];
      expect(data).toEqual(expect.objectContaining({ status: 'CONFIRMED' }));
      expect(data).not.toHaveProperty('title');
    });

    it('durationMinutes fora de 1–480 → 400', async () => {
      await expect(service.update(APT, sessao(), { durationMinutes: 999 })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('notifica o atleta B2C na mudança de status (corrige A60)', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: APT, trainerId: EU, athleteId: OUTRO, student: null, status: 'PENDING',
        scheduledAt: new Date('2099-01-01'), title: 'Sessão', googleEventId: null,
      });

      await service.update(APT, sessao(), { status: 'CONFIRMED' });

      expect(notifications.criar).toHaveBeenCalledWith(expect.objectContaining({ userId: OUTRO }));
    });
  });

  describe('update — generate-link (D68, corrige A61)', () => {
    it('nunca expira depois do próprio agendamento', async () => {
      const daquiA2Dias = new Date(Date.now() + 2 * 24 * 3600 * 1000);
      prisma.appointment.findUnique.mockResolvedValue({
        id: APT, trainerId: EU, athleteId: OUTRO, student: null, status: 'PENDING', scheduledAt: daquiA2Dias,
      });

      await service.update(APT, sessao(), { action: 'generate-link' });

      const { confirmExpiresAt } = prisma.appointment.update.mock.calls[0][0].data;
      expect(confirmExpiresAt.getTime()).toBeLessThanOrEqual(daquiA2Dias.getTime());
    });

    // CONTROLE: com agendamento distante, o teto de 7 dias é que vale.
    it('[controle] agendamento distante recebe o teto de 7 dias', async () => {
      const daquiA30Dias = new Date(Date.now() + 30 * 24 * 3600 * 1000);
      prisma.appointment.findUnique.mockResolvedValue({
        id: APT, trainerId: EU, athleteId: OUTRO, student: null, status: 'PENDING', scheduledAt: daquiA30Dias,
      });

      await service.update(APT, sessao(), { action: 'generate-link' });

      const { confirmExpiresAt } = prisma.appointment.update.mock.calls[0][0].data;
      const oitoDias = Date.now() + 8 * 24 * 3600 * 1000;
      expect(confirmExpiresAt.getTime()).toBeLessThan(oitoDias);
    });

    it('agendamento no passado → 400', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: APT, trainerId: EU, athleteId: OUTRO, student: null, status: 'PENDING', scheduledAt: new Date('2020-01-01'),
      });
      await expect(service.update(APT, sessao(), { action: 'generate-link' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('status diferente de PENDING → 400', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: APT, trainerId: EU, athleteId: OUTRO, student: null, status: 'CONFIRMED', scheduledAt: new Date('2099-01-01'),
      });
      await expect(service.update(APT, sessao(), { action: 'generate-link' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('atendido não gera link → 403', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: APT, trainerId: OUTRO, athleteId: EU, student: null, status: 'PENDING', scheduledAt: new Date('2099-01-01'),
      });
      await expect(service.update(APT, sessao(), { action: 'generate-link' })).rejects.toBeInstanceOf(HttpException);
    });
  });

  describe('remove', () => {
    it('atendido não apaga → 403', async () => {
      prisma.appointment.findUnique.mockResolvedValue({ id: APT, trainerId: OUTRO, athleteId: EU, googleEventId: null });
      await expect(service.remove(APT, sessao())).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.appointment.delete).not.toHaveBeenCalled();
    });

    it('profissional apaga e remove o evento do Google', async () => {
      prisma.appointment.findUnique.mockResolvedValue({ id: APT, trainerId: EU, athleteId: OUTRO, googleEventId: 'ev-9' });

      await service.remove(APT, sessao());

      expect(prisma.appointment.delete).toHaveBeenCalledWith({ where: { id: APT } });
      expect(calendar.apagarEvento).toHaveBeenCalledWith(EU, 'ev-9');
    });

    it('falha do Google não impede o delete', async () => {
      prisma.appointment.findUnique.mockResolvedValue({ id: APT, trainerId: EU, athleteId: OUTRO, googleEventId: 'ev-9' });
      calendar.apagarEvento.mockRejectedValue(new Error('calendar fora'));

      await expect(service.remove(APT, sessao())).resolves.toBeDefined();
      expect(prisma.appointment.delete).toHaveBeenCalled();
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * D67 / D68 — link mágico
   * ────────────────────────────────────────────────────────────────────────── */

  describe('confirmação por token (público)', () => {
    beforeEach(() => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: APT, title: 'Sessão', status: 'PENDING', confirmToken: 'tok-1',
        confirmExpiresAt: new Date('2099-01-01'), scheduledAt: new Date('2099-01-01'),
        trainer: { name: 'Ana', image: null },
      });
    });

    it('não devolve o próprio token (A62)', async () => {
      const r = await service.findByToken('tok-1');
      expect(r.appointment).not.toHaveProperty('confirmToken');
    });

    it('token inexistente → 404', async () => {
      prisma.appointment.findUnique.mockResolvedValue(null);
      await expect(service.findByToken('nada')).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each([['CONFIRMED'], ['CANCELED'], ['COMPLETED']])('status %s → 409', async (status) => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: APT, status, confirmToken: 'tok-1', confirmExpiresAt: new Date('2099-01-01'),
      });
      const body = await bodyOfRejection(service.findByToken('tok-1'));
      expect(body).toEqual({ error: expect.any(String) });
    });

    it('expirado → 409', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: APT, status: 'PENDING', confirmToken: 'tok-1', confirmExpiresAt: new Date('2020-01-01'),
      });
      await expect(service.findByToken('tok-1')).rejects.toBeInstanceOf(HttpException);
    });

    it('ação inválida → 400', async () => {
      await expect(service.confirmByToken('tok-1', 'apagar')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('confirmar anula o token no mesmo update', async () => {
      await service.confirmByToken('tok-1', 'confirm');
      const { data } = prisma.appointment.updateMany.mock.calls[0][0];
      expect(data).toEqual(expect.objectContaining({ status: 'CONFIRMED', confirmToken: null }));
    });

    // A corrida do A62: a escrita filtra pelo token (D17), então a segunda
    // requisição concorrente altera 0 linhas.
    it('confirmação concorrente → 409, não 500', async () => {
      prisma.appointment.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.confirmByToken('tok-1', 'confirm')).rejects.toBeInstanceOf(HttpException);
    });

    it('a escrita filtra pelo token, não só pelo id', async () => {
      await service.confirmByToken('tok-1', 'confirm');
      const { where } = prisma.appointment.updateMany.mock.calls[0][0];
      expect(where).toEqual(expect.objectContaining({ confirmToken: 'tok-1' }));
    });
  });
});
