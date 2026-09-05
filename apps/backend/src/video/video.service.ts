import { Injectable, Logger, Optional } from '@nestjs/common';
import { randomBytes } from 'crypto';

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
}

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
