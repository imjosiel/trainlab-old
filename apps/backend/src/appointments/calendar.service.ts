import { Injectable, Logger } from '@nestjs/common';
// `@googleapis/calendar`, não o barril `googleapis` (A67).
//
// O barril carrega TODAS as APIs do Google: 209 MB em disco e +65 MB de heap por
// import, contra 851 KB e +5 MB deste. Com o ts-jest carregando os tipos de tudo
// em cada worker, os dois jobs da CI morreram com "JavaScript heap out of
// memory" — e passavam na minha máquina, que tem folga de RAM.
import { auth, calendar, calendar_v3 } from '@googleapis/calendar';

import { PrismaService } from '@/prisma/prisma.service';

export interface DadosDoEvento {
  title: string;
  description?: string | null;
  scheduledAt: Date;
  durationMinutes: number;
  attendeeEmail?: string | null;
}

export interface EventoCriado {
  meetLink: string;
  eventId: string;
}

const FUSO = 'America/Sao_Paulo';

/**
 * Porta do Google Calendar (D66) — espelha o `RealtimeService` do D62.
 *
 * Existe separada pelo mesmo motivo de teste: as propriedades que importam são
 * "falha lá fora não derruba a escrita aqui" e "corpo inválido não chega a tocar
 * no Google", e nenhuma das duas é demonstrável com a chamada embutida no
 * serviço de domínio.
 *
 * Pode morar no backend porque os tokens OAuth vêm da tabela `Account` (gravada
 * pelo PrismaAdapter do NextAuth), **não da sessão** — o Nest fala com o mesmo
 * banco. Não há fluxo OAuth próprio aqui.
 *
 * Porte de `apps/web/lib/google-calendar.ts`.
 */
@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(private readonly prisma: PrismaService) {}

  private clienteOAuth() {
    return new auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      // Mesmo redirect URI do NextAuth — não é um fluxo separado.
      `${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/api/auth/callback/google`,
    );
  }

  /**
   * Cliente autenticado, ou `null` quando o usuário não conectou o Google.
   *
   * `null` em vez de exceção porque "não conectou o calendário" é estado normal,
   * não erro: o legado sinaliza isso ao cliente como `meetNotAvailable`.
   */
  private async calendario(userId: string): Promise<calendar_v3.Calendar | null> {
    const account = await this.prisma.account.findFirst({
      where: { userId, provider: 'google' },
      select: { id: true, access_token: true, refresh_token: true, expires_at: true, scope: true },
    });

    if (!account?.refresh_token) return null;

    const escopo = account.scope ?? '';
    const temEscopoDeCalendario =
      escopo.includes('calendar.events') || escopo.includes('calendar.app.created');
    if (!temEscopoDeCalendario) return null;

    const oauth = this.clienteOAuth();
    oauth.setCredentials({
      access_token: account.access_token,
      refresh_token: account.refresh_token,
      expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
    });

    // O access_token expira em uma hora; a biblioteca renova sozinha e avisa
    // aqui. Sem persistir, toda requisição gastaria um refresh.
    oauth.on('tokens', (tokens) => {
      void this.prisma.account
        .update({
          where: { id: account.id },
          data: {
            ...(tokens.access_token ? { access_token: tokens.access_token } : {}),
            ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
            ...(tokens.expiry_date ? { expires_at: Math.floor(tokens.expiry_date / 1000) } : {}),
          },
        })
        .catch((e: unknown) =>
          this.logger.warn(
            `Falha ao persistir token renovado: ${e instanceof Error ? e.message : String(e)}`,
          ),
        );
    });

    return calendar({ version: 'v3', auth: oauth });
  }

  async criarEvento(userId: string, dados: DadosDoEvento): Promise<EventoCriado | null> {
    const calendario = await this.calendario(userId);
    if (!calendario) return null;

    const inicio = new Date(dados.scheduledAt);
    const fim = new Date(inicio.getTime() + dados.durationMinutes * 60_000);

    const { data: evento } = await calendario.events.insert({
      calendarId: 'primary',
      conferenceDataVersion: 1,
      requestBody: {
        summary: dados.title,
        description: dados.description ?? undefined,
        start: { dateTime: inicio.toISOString(), timeZone: FUSO },
        end: { dateTime: fim.toISOString(), timeZone: FUSO },
        ...(dados.attendeeEmail ? { attendees: [{ email: dados.attendeeEmail }] } : {}),
        conferenceData: {
          createRequest: {
            requestId: `meet-${inicio.getTime()}-${userId.slice(0, 8)}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      },
    });

    const meetLink = evento.conferenceData?.entryPoints?.find(
      (ponto) => ponto.entryPointType === 'video',
    )?.uri;

    // Evento sem link de vídeo não serve para o que o produto promete, e devolver
    // um par meio preenchido faria o chamador gravar `googleEventId` sem Meet.
    if (!meetLink || !evento.id) return null;

    return { meetLink, eventId: evento.id };
  }

  async atualizarEvento(
    userId: string,
    eventId: string,
    dados: Partial<DadosDoEvento>,
  ): Promise<void> {
    const calendario = await this.calendario(userId);
    if (!calendario) return;

    const { data: atual } = await calendario.events.get({ calendarId: 'primary', eventId });
    const patch: calendar_v3.Schema$Event = { ...atual };

    if (dados.title) patch.summary = dados.title;
    if (dados.description !== undefined) patch.description = dados.description ?? undefined;

    if (dados.scheduledAt || dados.durationMinutes) {
      const inicio = dados.scheduledAt
        ? new Date(dados.scheduledAt)
        : new Date(atual.start?.dateTime ?? '');
      const fim = new Date(inicio.getTime() + (dados.durationMinutes ?? 60) * 60_000);
      patch.start = { dateTime: inicio.toISOString(), timeZone: FUSO };
      patch.end = { dateTime: fim.toISOString(), timeZone: FUSO };
    }

    if (dados.attendeeEmail) patch.attendees = [{ email: dados.attendeeEmail }];

    await calendario.events.update({ calendarId: 'primary', eventId, requestBody: patch });
  }

  async apagarEvento(userId: string, eventId: string): Promise<void> {
    const calendario = await this.calendario(userId);
    if (!calendario) return;

    await calendario.events.delete({ calendarId: 'primary', eventId });
  }
}
