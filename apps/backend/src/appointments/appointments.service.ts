import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';

import { SessionPayload } from '@/auth/session-payload';
import { ROLES } from '@/common/constants';
import { parsePage } from '@/common/pagination';
import { NotificationsService } from '@/notifications/notifications.service';
import { PrismaService } from '@/prisma/prisma.service';
import { PedidoVideo, SalaVideo, VideoService } from '@/video/video.service';
import { CalendarService } from './calendar.service';
import { CreateAppointmentBody, UpdateAppointmentBody } from './dtos';

export interface ListAppointmentsQuery {
  status?: string;
  from?: string;
  to?: string;
  page?: string;
  trainerId?: string;
}

export type AcaoDeConfirmacao = 'confirm' | 'cancel';

const PAGE_SIZE = 50;
const STATUS_VALIDOS = ['PENDING', 'CONFIRMED', 'CANCELED', 'COMPLETED'] as const;
const STATUS_DO_ATENDIDO = ['CONFIRMED', 'CANCELED'];
const MAX_TITULO = 150;
const VALIDADE_DO_LINK_MS = 7 * 24 * 60 * 60 * 1000;

const PESSOA = { select: { id: true, name: true, email: true, image: true } } as const;

const INCLUDE_PADRAO = {
  student: {
    select: {
      id: true,
      name: true,
      email: true,
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  },
  athlete: PESSOA,
  trainer: PESSOA,
  trainingPlan: { select: { id: true, title: true, status: true } },
} as const;

/** Campos que a página pública do link mágico mostra. `confirmToken` NÃO sai (A62). */
const CAMPOS_PUBLICOS = {
  id: true,
  title: true,
  description: true,
  scheduledAt: true,
  durationMinutes: true,
  location: true,
  status: true,
  confirmToken: true, // lido para validar; removido antes de responder
  confirmExpiresAt: true,
  confirmedAt: true,
  trainer: { select: { name: true, image: true } },
} as const;

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly calendar: CalendarService,
    private readonly notifications: NotificationsService,
    // @Optional para não quebrar os specs antigos que instanciam com 3 args.
    // Tipo sem união `| null`: com união o emitDecoratorMetadata vira Object
    // e o Nest não resolve a dependência (vira undefined no e2e).
    @Optional() private readonly video?: VideoService,
  ) {}

  /**
   * Participação — D64, e o que corrige o A57.
   *
   * O legado escolhia o lado pelo PAPEL (`roles.includes(PROFESSIONAL)`), e quem
   * acumulava `PROFESSIONAL` e `CLIENT` perdia da agenda tudo que marcaram para
   * ele. Medido no monolito antes desta fatia: "vê o que MARCARAM PARA ELE:
   * false".
   *
   * São TRÊS formas de participar porque o modelo tem três: dono da agenda,
   * atleta B2C (`athleteId`) e aluno B2B (via `Student.userId`).
   */
  private participacao(userId: string) {
    return {
      OR: [{ trainerId: userId }, { athleteId: userId }, { student: { userId } }],
    };
  }

  async list(
    user: SessionPayload,
    query: ListAppointmentsQuery,
  ): Promise<{ appointments: unknown[]; total: number; page: number; pages: number }> {
    if (query.status && !(STATUS_VALIDOS as readonly string[]).includes(query.status)) {
      throw new BadRequestException({
        error: `status inválido. Aceitos: ${STATUS_VALIDOS.join(', ')}`,
      });
    }

    // Validar ANTES de construir: `new Date('x')` é Invalid Date, e Invalid Date
    // guardado numa variável vira 500 no Prisma lá adiante (BUG-66 no legado).
    const intervalo: { gte?: Date; lte?: Date } = {};
    for (const campo of ['from', 'to'] as const) {
      const bruto = query[campo];
      if (!bruto) continue;
      const data = new Date(bruto);
      if (Number.isNaN(data.getTime())) {
        throw new BadRequestException({ error: `Parâmetro "${campo}" inválido` });
      }
      if (campo === 'from') intervalo.gte = data;
      else intervalo.lte = data;
    }

    const page = parsePage(query.page ?? '1');

    // O papel só decide UMA coisa: se admin pode olhar agenda de terceiro. E isso
    // vem de `systemRoles` (via `isAdmin`, derivado — D3), nunca de `roles`.
    const where =
      user.isAdmin && query.trainerId
        ? { trainerId: query.trainerId }
        : this.participacao(user.id);

    const filtro = {
      ...where,
      ...(query.status ? { status: query.status as (typeof STATUS_VALIDOS)[number] } : {}),
      ...(Object.keys(intervalo).length > 0 ? { scheduledAt: intervalo } : {}),
    };

    const [appointments, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where: filtro,
        include: INCLUDE_PADRAO,
        orderBy: { scheduledAt: 'asc' },
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      }),
      // MESMO filtro. Contagem com filtro diferente é um total que mente, e a
      // paginação da tela é construída em cima dele.
      this.prisma.appointment.count({ where: filtro }),
    ]);

    return { appointments, total, page, pages: Math.ceil(total / PAGE_SIZE) };
  }

  async create(
    user: SessionPayload,
    body: CreateAppointmentBody,
  ): Promise<{ appointment: { id: string }; meetNotAvailable: boolean }> {
    const ehProfissional = user.roles?.includes(ROLES.PROFESSIONAL);
    if (!ehProfissional && !user.isAdmin) {
      throw new ForbiddenException({ error: 'Apenas profissionais podem criar agendamentos' });
    }

    // ── Validação PRIMEIRO (A59) ─────────────────────────────────────────────
    // No legado o bloco do Google Meet rodava ANTES daqui: requisição sem título
    // criava evento na agenda do profissional, disparava convite, e respondia
    // 400. O agendamento não existia; o evento, sim.
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const studentId = typeof body.studentId === 'string' ? body.studentId : null;
    const athleteId = typeof body.athleteId === 'string' ? body.athleteId : null;

    if (!title || body.scheduledAt === undefined || body.scheduledAt === null) {
      throw new BadRequestException({ error: 'title e scheduledAt são obrigatórios' });
    }
    if (title.length > MAX_TITULO) {
      throw new BadRequestException({ error: `Título máximo ${MAX_TITULO} caracteres` });
    }

    const scheduledAt = new Date(body.scheduledAt as string);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException({ error: 'scheduledAt inválido. Use formato ISO 8601.' });
    }
    if (!studentId && !athleteId) {
      throw new BadRequestException({ error: 'Informe studentId ou athleteId' });
    }

    const durationMinutes = this.duracaoValida(body.durationMinutes) ?? 60;

    // ── Posse do participante (IDOR) ─────────────────────────────────────────
    let emailDoParticipante: string | null = null;

    if (studentId) {
      const aluno = await this.prisma.student.findUnique({
        where: { id: studentId },
        select: { trainerId: true, userId: true, email: true },
      });
      if (!aluno) throw new NotFoundException({ error: 'Aluno não encontrado' });
      if (!user.isAdmin && aluno.trainerId !== user.id) {
        throw new ForbiddenException({ error: 'Acesso negado' });
      }
      emailDoParticipante = aluno.email ?? null;
    }

    if (athleteId) {
      const vinculo = await this.prisma.trainerAthlete.findFirst({
        where: { athleteId, trainerId: user.id },
        select: { athleteId: true },
      });
      if (!vinculo && !user.isAdmin) {
        throw new ForbiddenException({ error: 'Acesso negado' });
      }
      const atleta = await this.prisma.user.findUnique({
        where: { id: athleteId },
        select: { email: true },
      });
      emailDoParticipante = atleta?.email ?? null;
    }

    // ── Grava ANTES de falar com o mundo externo (D66) ────────────────────────
    const appointment = await this.prisma.appointment.create({
      data: {
        trainerId: user.id,
        studentId,
        athleteId,
        title,
        description: (body.description as string) ?? null,
        scheduledAt,
        durationMinutes,
        location: (body.location as string) ?? null,
        trainerNotes: (body.trainerNotes as string) ?? null,
        trainingPlanId: (body.trainingPlanId as string) ?? null,
        status: 'PENDING',
      },
      include: INCLUDE_PADRAO,
    });

    // ── Google Meet, opcional e não-crítico ──────────────────────────────────
    let atualizado: { id: string } = appointment;
    let meetNotAvailable = false;

    if (body.createMeet && ehProfissional) {
      try {
        const evento = await this.calendar.criarEvento(user.id, {
          title,
          description: (body.description as string) ?? null,
          scheduledAt,
          durationMinutes,
          attendeeEmail: emailDoParticipante,
        });

        if (evento) {
          atualizado = await this.prisma.appointment.update({
            where: { id: appointment.id },
            data: {
              googleMeetLink: evento.meetLink,
              googleEventId: evento.eventId,
              location: evento.meetLink,
            },
            include: INCLUDE_PADRAO,
          });
        } else {
          meetNotAvailable = true;
        }
      } catch (erro) {
        // O agendamento já existe. Deixar o erro subir devolveria 500 numa
        // escrita que funcionou, e o profissional marcaria de novo.
        meetNotAvailable = true;
        this.logger.warn(
          `Agendamento ${appointment.id} criado sem Meet: ${
            erro instanceof Error ? erro.message : String(erro)
          }`,
        );
      }
    }

    await this.notificar(appointment, {
      type: 'SYSTEM',
      title: 'Novo agendamento! 📅',
      message: `Seu profissional marcou um agendamento: "${title}" em ${scheduledAt.toLocaleString('pt-BR')}`,
    });

    return { appointment: atualizado, meetNotAvailable };
  }

  async update(
    id: string,
    user: SessionPayload,
    body: UpdateAppointmentBody,
  ): Promise<{ appointment: { id: string }; confirmUrl?: string }> {
    const atual = await this.prisma.appointment.findUnique({
      where: { id },
      include: { student: { select: { userId: true } } },
    });
    if (!atual) throw new NotFoundException({ error: 'Agendamento não encontrado' });

    const ehDono = atual.trainerId === user.id;
    const ehAtendido = atual.athleteId === user.id || atual.student?.userId === user.id;
    const mandaNoAgendamento = ehDono || user.isAdmin;

    if (!mandaNoAgendamento && !ehAtendido) {
      throw new ForbiddenException({ error: 'Acesso negado' });
    }

    // ── Atendido: só confirma ou cancela ─────────────────────────────────────
    if (ehAtendido && !mandaNoAgendamento) {
      const status = body.status;
      if (typeof status !== 'string' || !STATUS_DO_ATENDIDO.includes(status)) {
        throw new BadRequestException({ error: 'Você pode apenas confirmar ou cancelar' });
      }

      const appointment = await this.prisma.appointment.update({
        where: { id },
        data: {
          status: status as (typeof STATUS_VALIDOS)[number],
          ...(status === 'CONFIRMED' ? { confirmedAt: new Date() } : {}),
          ...(typeof body.cancelReason === 'string' ? { cancelReason: body.cancelReason } : {}),
        },
      });

      await this.avisar(atual.trainerId, {
        type: 'APPOINTMENT_STATUS',
        title: status === 'CONFIRMED' ? 'Agendamento confirmado' : 'Agendamento cancelado',
        message:
          status === 'CONFIRMED'
            ? `Confirmaram o agendamento "${atual.title}".`
            : `Cancelaram o agendamento "${atual.title}".`,
        metadata: { appointmentId: id, status },
      });

      return { appointment };
    }

    // ── Ações de link mágico: só quem manda ──────────────────────────────────
    if (body.action === 'generate-link') {
      if (atual.scheduledAt <= new Date()) {
        throw new BadRequestException({
          error: 'Não é possível gerar link para agendamentos no passado',
        });
      }
      if (atual.status !== 'PENDING') {
        throw new BadRequestException({
          error: 'Link só pode ser gerado para agendamentos pendentes',
        });
      }

      const token = randomUUID();
      // D68: o schema promete "expira na hora do agendamento" e o legado dava 7
      // dias fixos — link de um agendamento de amanhã seguia válido por uma
      // semana. O mínimo honra a promessa sem alongar o que já era mais curto.
      const expiraEm = new Date(
        Math.min(atual.scheduledAt.getTime(), Date.now() + VALIDADE_DO_LINK_MS),
      );

      const appointment = await this.prisma.appointment.update({
        where: { id },
        data: { confirmToken: token, confirmExpiresAt: expiraEm },
      });

      const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
      return { appointment, confirmUrl: `${base}/confirm/${token}` };
    }

    if (body.action === 'revoke-link') {
      const appointment = await this.prisma.appointment.update({
        where: { id },
        data: { confirmToken: null, confirmExpiresAt: null },
      });
      return { appointment };
    }

    // ── Dono ou admin: edita o que quiser ────────────────────────────────────
    const status = body.status;
    if (status !== undefined && !(STATUS_VALIDOS as readonly string[]).includes(String(status))) {
      throw new BadRequestException({ error: 'Status inválido' });
    }
    if (typeof body.title === 'string' && body.title.length > MAX_TITULO) {
      throw new BadRequestException({ error: `Título máximo ${MAX_TITULO} caracteres` });
    }

    let scheduledAt: Date | undefined;
    if (body.scheduledAt !== undefined) {
      scheduledAt = new Date(body.scheduledAt as string);
      if (Number.isNaN(scheduledAt.getTime())) {
        throw new BadRequestException({ error: 'scheduledAt inválido. Use formato ISO 8601.' });
      }
    }

    let durationMinutes: number | undefined;
    if (body.durationMinutes !== undefined) {
      const valida = this.duracaoValida(body.durationMinutes);
      if (valida === null) {
        throw new BadRequestException({
          error: 'durationMinutes deve ser um número entre 1 e 480.',
        });
      }
      durationMinutes = valida;
    }

    const appointment = await this.prisma.appointment.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: String(body.title) } : {}),
        ...(scheduledAt ? { scheduledAt } : {}),
        ...(durationMinutes !== undefined ? { durationMinutes } : {}),
        ...(body.location !== undefined ? { location: body.location as string } : {}),
        ...(body.description !== undefined ? { description: body.description as string } : {}),
        ...(body.trainerNotes !== undefined ? { trainerNotes: body.trainerNotes as string } : {}),
        ...(status !== undefined ? { status: status as (typeof STATUS_VALIDOS)[number] } : {}),
        ...(body.cancelReason !== undefined ? { cancelReason: body.cancelReason as string } : {}),
        ...(body.trainingPlanId !== undefined
          ? { trainingPlanId: body.trainingPlanId as string }
          : {}),
        ...(status === 'CANCELED' ? { googleMeetLink: null, googleEventId: null } : {}),
      },
    });

    await this.sincronizarCalendario(atual, { status, scheduledAt, durationMinutes, title: body.title });

    if (typeof status === 'string') {
      const textos: Record<string, { title: string; message: string }> = {
        CONFIRMED: { title: 'Agendamento confirmado', message: `"${atual.title}" foi confirmado.` },
        CANCELED: { title: 'Agendamento cancelado', message: `"${atual.title}" foi cancelado.` },
        COMPLETED: { title: 'Sessão concluída', message: `"${atual.title}" foi concluída.` },
      };
      const texto = textos[status];
      if (texto) {
        // A60: o legado avisava só `student.userId`, então atleta B2C nunca
        // soube que o agendamento dele mudou. `notificar` cobre os dois lados.
        await this.notificar(atual, { type: 'APPOINTMENT_STATUS', ...texto, metadata: { appointmentId: id, status } });
      }
    }

    return { appointment };
  }

  async remove(id: string, user: SessionPayload): Promise<{ message: string }> {
    const atual = await this.prisma.appointment.findUnique({
      where: { id },
      select: { trainerId: true, googleEventId: true },
    });
    if (!atual) throw new NotFoundException({ error: 'Agendamento não encontrado' });

    if (atual.trainerId !== user.id && !user.isAdmin) {
      throw new ForbiddenException({ error: 'Apenas o profissional pode apagar agendamentos' });
    }

    if (atual.googleEventId) {
      try {
        await this.calendar.apagarEvento(atual.trainerId, atual.googleEventId);
      } catch (erro) {
        this.logger.warn(
          `Evento do Google não removido: ${erro instanceof Error ? erro.message : String(erro)}`,
        );
      }
    }

    await this.prisma.appointment.delete({ where: { id } });
    return { message: 'Agendamento deletado' };
  }

  /* ────────────────────────────────────────────────────────────────────────
   * Vídeo 1:1 próprio (fatia 37) — aditivo, Meet continua intacto.
   *
   * Mesmo contrato do Meet: opcional e não-crítico. Falha externa vira
   * `videoNotAvailable: true`, nunca 500 em escrita que funcionou (D66).
   * Idempotente por agendamento: segunda chamada devolve a mesma sala sem
   * tocar no provider (evita custo e expiração dupla).
   * ──────────────────────────────────────────────────────────────────────── */

  async criarSalaDeVideo(
    id: string,
    user: SessionPayload,
    body: { provider?: unknown },
  ): Promise<{ video: SalaVideo | null; videoNotAvailable?: boolean }> {
    const atual = await this.prisma.appointment.findUnique({
      where: { id },
      include: { student: { select: { userId: true } } },
    });
    if (!atual) throw new NotFoundException({ error: 'Agendamento não encontrado' });
    this.exigirParticipante(atual, user);

    if (atual.videoJoinUrl && atual.videoRoomName && atual.videoProvider) {
      return {
        video: {
          provider: atual.videoProvider as SalaVideo['provider'],
          roomName: atual.videoRoomName,
          joinUrl: atual.videoJoinUrl,
        },
      };
    }

    const pedido = this.pedidoVideoValido(body?.provider);
    try {
      const sala = await this.videoOrThrow().criarSala(
        id,
        { scheduledAt: new Date(atual.scheduledAt), durationMinutes: atual.durationMinutes ?? 60 },
        pedido,
      );
      const atualizado = await this.prisma.appointment.update({
        where: { id },
        data: { videoProvider: sala.provider, videoRoomName: sala.roomName, videoJoinUrl: sala.joinUrl },
      });
      this.logger.log(`Sala de vídeo criada para ${id} via ${sala.provider}.`);
      return {
        video: {
          provider: atualizado.videoProvider as SalaVideo['provider'],
          roomName: atualizado.videoRoomName as string,
          joinUrl: atualizado.videoJoinUrl as string,
        },
      };
    } catch (erro) {
      this.logger.warn(
        `Agendamento ${id} sem vídeo próprio: ${erro instanceof Error ? erro.message : String(erro)}`,
      );
      return { video: null, videoNotAvailable: true };
    }
  }

  async lerSalaDeVideo(id: string, user: SessionPayload): Promise<SalaVideo> {
    const atual = await this.prisma.appointment.findUnique({
      where: { id },
      include: { student: { select: { userId: true } } },
    });
    if (!atual) throw new NotFoundException({ error: 'Agendamento não encontrado' });
    this.exigirParticipante(atual, user);
    if (!atual.videoJoinUrl || !atual.videoRoomName || !atual.videoProvider) {
      throw new NotFoundException({ error: 'Sala de vídeo não gerada para este agendamento' });
    }
    return {
      provider: atual.videoProvider as SalaVideo['provider'],
      roomName: atual.videoRoomName,
      joinUrl: atual.videoJoinUrl,
    };
  }

  private exigirParticipante(
    atual: { trainerId: string; athleteId?: string | null; student?: { userId?: string | null } | null },
    user: SessionPayload,
  ): void {
    const participa =
      user.isAdmin ||
      atual.trainerId === user.id ||
      atual.athleteId === user.id ||
      atual.student?.userId === user.id;
    if (!participa) throw new ForbiddenException({ error: 'Acesso negado' });
  }

  private pedidoVideoValido(bruto: unknown): PedidoVideo {
    return bruto === 'daily' || bruto === 'jitsi' || bruto === 'auto' ? bruto : 'auto';
  }

  private videoOrThrow(): VideoService {
    if (!this.video) throw new Error('VideoService não registrado.');
    return this.video;
  }

  /* ────────────────────────────────────────────────────────────────────────
   * Link mágico — públicas (D67). O token É a autorização.
   * ──────────────────────────────────────────────────────────────────────── */

  async findByToken(token: string): Promise<{ appointment: Record<string, unknown> }> {
    const apt = await this.prisma.appointment.findUnique({
      where: { confirmToken: token },
      select: CAMPOS_PUBLICOS,
    });

    return { appointment: this.semToken(this.exigirTokenUtilizavel(apt)) };
  }

  async confirmByToken(
    token: string,
    acao: unknown,
  ): Promise<{ appointment: Record<string, unknown>; action: AcaoDeConfirmacao }> {
    const apt = await this.prisma.appointment.findUnique({
      where: { confirmToken: token },
      select: CAMPOS_PUBLICOS,
    });
    const valido = this.exigirTokenUtilizavel(apt);

    if (acao !== 'confirm' && acao !== 'cancel') {
      throw new BadRequestException({ error: 'Ação inválida' });
    }

    // A62 — a corrida. `updateMany` filtrando pelo token (posse como filtro da
    // escrita, D17) faz a segunda requisição concorrente alterar ZERO linhas, em
    // vez de estourar P2025 num `update` e virar 500.
    const { count } = await this.prisma.appointment.updateMany({
      where: { confirmToken: token },
      data: {
        status: acao === 'confirm' ? 'CONFIRMED' : 'CANCELED',
        confirmedAt: acao === 'confirm' ? new Date() : null,
        confirmToken: null,
        confirmExpiresAt: null,
      },
    });

    if (count === 0) {
      throw new ConflictException({ error: 'ALREADY_CONFIRMED' });
    }

    const depois = await this.prisma.appointment.findUnique({
      where: { id: valido.id as string },
      select: CAMPOS_PUBLICOS,
    });

    return { appointment: this.semToken(depois ?? valido), action: acao };
  }

  /* ────────────────────────────────────────────────────────────────────────
   * Auxiliares
   * ──────────────────────────────────────────────────────────────────────── */

  private exigirTokenUtilizavel(
    apt: Record<string, unknown> | null,
  ): Record<string, unknown> {
    if (!apt || !apt.confirmToken) {
      throw new NotFoundException({ error: 'INVALID' });
    }
    if (apt.status === 'CONFIRMED') throw new ConflictException({ error: 'ALREADY_CONFIRMED' });
    if (apt.status === 'CANCELED') throw new ConflictException({ error: 'CANCELED' });
    if (apt.status === 'COMPLETED') throw new ConflictException({ error: 'COMPLETED' });

    const expira = apt.confirmExpiresAt as Date | null;
    if (expira && new Date() > new Date(expira)) {
      throw new ConflictException({ error: 'EXPIRED' });
    }

    return apt;
  }

  /** O token é lido para validar e removido antes de sair (A62). */
  private semToken(apt: Record<string, unknown>): Record<string, unknown> {
    const { confirmToken: _descartado, ...publico } = apt;
    return publico;
  }

  private duracaoValida(bruto: unknown): number | null {
    if (bruto === undefined || bruto === null) return null;
    const n = typeof bruto === 'number' ? bruto : parseInt(String(bruto), 10);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 480) return null;
    return n;
  }

  /**
   * Quem está do lado atendido — atleta B2C ou o usuário por trás do aluno B2B.
   *
   * Aceita as duas formas porque os dois `include` deste arquivo trazem o
   * `Student` diferente: o de criação embute `user: { id }`, o de atualização só
   * precisa de `userId`. Achatar num tipo só aqui evita que a diferença de
   * include vire uma notificação silenciosamente não enviada.
   */
  private destinatarioDe(apt: {
    athleteId?: string | null;
    student?: { userId?: string | null; user?: { id?: string | null } | null } | null;
  }): string | null {
    return apt.student?.user?.id ?? apt.student?.userId ?? apt.athleteId ?? null;
  }

  /** Avisa quem está do lado atendido — atleta B2C ou usuário por trás do aluno B2B. */
  private async notificar(
    apt: {
      athleteId?: string | null;
      student?: { userId?: string | null; user?: { id?: string | null } | null } | null;
    },
    conteudo: { type: string; title: string; message: string; metadata?: Record<string, unknown> },
  ): Promise<void> {
    const destinatario = this.destinatarioDe(apt);
    if (!destinatario) return;
    await this.avisar(destinatario, conteudo);
  }

  private async avisar(
    userId: string,
    conteudo: { type: string; title: string; message: string; metadata?: Record<string, unknown> },
  ): Promise<void> {
    try {
      await this.notifications.criar({ userId, link: '/dashboard/appointments', ...conteudo });
    } catch (erro) {
      // Notificação é acessório. Derrubar a operação de domínio por causa dela
      // trocaria um aviso perdido por uma escrita perdida.
      this.logger.warn(
        `Notificação não enviada: ${erro instanceof Error ? erro.message : String(erro)}`,
      );
    }
  }

  private async sincronizarCalendario(
    atual: { trainerId: string; googleEventId: string | null },
    mudanca: { status?: unknown; scheduledAt?: Date; durationMinutes?: number; title?: unknown },
  ): Promise<void> {
    if (!atual.googleEventId) return;

    try {
      if (mudanca.status === 'CANCELED') {
        await this.calendar.apagarEvento(atual.trainerId, atual.googleEventId);
        return;
      }
      if (mudanca.scheduledAt || mudanca.durationMinutes) {
        await this.calendar.atualizarEvento(atual.trainerId, atual.googleEventId, {
          ...(typeof mudanca.title === 'string' ? { title: mudanca.title } : {}),
          ...(mudanca.scheduledAt ? { scheduledAt: mudanca.scheduledAt } : {}),
          ...(mudanca.durationMinutes ? { durationMinutes: mudanca.durationMinutes } : {}),
        });
      }
    } catch (erro) {
      this.logger.warn(
        `Calendário não sincronizado: ${erro instanceof Error ? erro.message : String(erro)}`,
      );
    }
  }
}
