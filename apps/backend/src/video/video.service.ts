import { Injectable, Logger, Optional } from '@nestjs/common';
import { createHmac, randomBytes } from 'crypto';

export type ProvedorVideo = 'daily' | 'jitsi';
export type PedidoVideo = ProvedorVideo | 'auto';

export interface DadosSalaVideo {
  scheduledAt: Date;
  durationMinutes: number;
}

export interface SalaVideo {
  provider: ProvedorVideo;
  roomName: string;
  joinUrl: string;
  /** JWT do Jitsi self-host (fatia 38) — presente só com segredo + domínio próprio. */
  token?: string;
}

export interface DadosTokenJitsi {
  roomName: string;
  userId: string;
  displayName: string;
  email?: string | null;
  moderator: boolean;
  /** Segundos de validade pedidos; respeita o teto de 12h. */
  expiraEmSegundos?: number;
}

/** Teto de validade do token Jitsi: 12h (evita token eterno em dado esquisito). */
const TETO_TOKEN_SEGUNDOS = 12 * 3600;

/**
 * Porta de vídeo 1:1 (fatia 37) — espelha o `CalendarService` (D66/D62).
 *
 * Existe separada pelo mesmo motivo de teste: "falha lá fora não derruba a
 * escrita aqui" e "corpo inválido não chega a tocar no provider" não são
 * demonstráveis com a chamada embutida no serviço de domínio.
 *
 * Seleção (o SERVIDOR decide, nunca o corpo da requisição):
 * `VIDEO_PROVIDER=daily|jitsi|auto` (default `auto`); `auto` = Daily se
 * `DAILY_API_KEY` presente, senão Jitsi. Pedido explícito `daily` sem chave
 * cai para Jitsi — nunca 500 por falta de configuração.
 */
@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);

  // @Optional: o Nest não tem provider para `fetch` — sem isso o boot falharia.
  // Em produção usa o fetch global; em teste injeta-se o mock.
  constructor(@Optional() private readonly http?: typeof fetch) {}

  async criarSala(
    appointmentId: string,
    dados: DadosSalaVideo,
    pedido: PedidoVideo = 'auto',
  ): Promise<SalaVideo> {
    const provider = this.escolherProvedor(pedido);
    const roomName = this.gerarRoomName(appointmentId);

    if (provider === 'jitsi') {
      return { provider, roomName, joinUrl: `https://${this.dominioJitsi()}/${roomName}` };
    }
    return this.criarSalaDaily(roomName, dados);
  }

  private escolherProvedor(pedido: PedidoVideo): ProvedorVideo {
    if (pedido === 'jitsi') return 'jitsi';
    const temChave = Boolean(process.env.DAILY_API_KEY);
    if (pedido === 'daily') return temChave ? 'daily' : 'jitsi';
    const cfg = (process.env.VIDEO_PROVIDER ?? 'auto').toLowerCase();
    if (cfg === 'jitsi') return 'jitsi';
    if (cfg === 'daily') return temChave ? 'daily' : 'jitsi';
    return temChave ? 'daily' : 'jitsi';
  }

  /**
   * Não-adivinhável: prefixo fixo + 6 do id (só para correlação humana) +
   * 16 hex aleatórios. O id puro nunca vira nome de sala (anti-enumeração).
   */
  private gerarRoomName(appointmentId: string): string {
    const base = appointmentId
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase()
      .slice(0, 6)
      .padEnd(6, '0');
    return `trainlab-${base}-${randomBytes(8).toString('hex')}`;
  }

  private dominioJitsi(): string {
    const bruto = process.env.JITSI_DOMAIN ?? 'meet.jit.si';
    return bruto.replace(/^https?:\/\//, '').replace(/\/+$/, '') || 'meet.jit.si';
  }

  /**
   * Minta JWT HS256 para o Jitsi self-host (fatia 38 — secure domain).
   *
   * Formato oficial do plugin Prosody (`lib-jitsi-meet/doc/tokens.md`):
   * `{ aud, iss, sub, room, exp, context: { user: { id, name, email, moderator } } }`.
   * Sem `jsonwebtoken`: HMAC via `crypto` nativo + base64url manual — payload
   * pequeno, zero deps novas. Lança sem segredo ou com `roomName` vazio
   * (nunca curinga `*`); quem engole é o chamador (padrão Meet/vídeo).
   */
  async mintJitsiToken(dados: DadosTokenJitsi): Promise<string> {
    const segredo = process.env.JITSI_JWT_SECRET;
    if (!segredo) throw new Error('JITSI_JWT_SECRET não configurado.');
    const room = typeof dados.roomName === 'string' ? dados.roomName.trim() : '';
    if (!room || room === '*') throw new Error('roomName inválido para token Jitsi.');
    const appId = process.env.JITSI_APP_ID ?? 'trainlab';
    const agora = Math.floor(Date.now() / 1000);
    const pedido = Number.isFinite(dados.expiraEmSegundos) ? (dados.expiraEmSegundos as number) : 3600;
    const validade = Math.max(60, Math.min(pedido, TETO_TOKEN_SEGUNDOS));
    const header = base64url({ alg: 'HS256', typ: 'JWT' });
    const payload = base64url({
      aud: appId,
      iss: appId,
      sub: this.dominioJitsi(),
      room,
      exp: agora + Math.floor(validade),
      context: {
        user: {
          id: dados.userId,
          name: dados.displayName,
          ...(dados.email ? { email: dados.email } : {}),
          moderator: dados.moderator,
        },
      },
    });
    const assinatura = createHmac('sha256', segredo).update(`${header}.${payload}`).digest('base64url');
    return `${header}.${payload}.${assinatura}`;
  }

  private async criarSalaDaily(roomName: string, dados: DadosSalaVideo): Promise<SalaVideo> {
    // exp = início + duração + 30min de margem, em segundos (a sala morre sozinha).
    const exp =
      Math.floor(dados.scheduledAt.getTime() / 1000) + dados.durationMinutes * 60 + 30 * 60;
    const base = (process.env.DAILY_API_URL ?? 'https://api.daily.co/v1/rooms').replace(/\/+$/, '');
    const invocar = this.http ?? fetch;

    let res: Response;
    try {
      res = await invocar(base, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
        },
        body: JSON.stringify({
          name: roomName,
          privacy: 'private',
          properties: { max_participants: 2, enable_screenshare: true, exp },
        }),
      });
    } catch (erro) {
      this.logger.warn(`Daily inalcançável: ${erro instanceof Error ? erro.message : String(erro)}`);
      throw new Error('Provedor de vídeo indisponível.');
    }

    if (!res.ok) {
      const detalhe = await res.text().catch(() => '');
      throw new Error(`Daily recusou a criação da sala (${res.status})${detalhe ? `: ${detalhe}` : ''}`);
    }
    const corpo = (await res.json()) as { name?: string; url?: string };
    if (!corpo.url) throw new Error('Daily respondeu sem URL da sala.');
    return { provider: 'daily', roomName: corpo.name ?? roomName, joinUrl: corpo.url };
  }
}

/** base64url sem padding, para JWT manual sem dependência nova. */
function base64url(valor: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(valor), 'utf8').toString('base64url');
}
