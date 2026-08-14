import { Injectable, Logger } from '@nestjs/common';
import Pusher from 'pusher';

/**
 * Porta de tempo real.
 *
 * Existe separada do `MessagesService` por uma razão de teste, não de estética:
 * o D62 diz que **falha de entrega não derruba a escrita**, e essa propriedade só
 * é demonstrável se der para fazer o disparo falhar de propósito. Com o Pusher
 * chamado direto de dentro do serviço, o teste teria que mockar o módulo inteiro.
 *
 * Nomes de canal e evento são contrato com o navegador e são os MESMOS do legado
 * (`apps/web/lib/pusher.ts`) — trocá-los quebraria o tempo real no cutover.
 */
export const canalDaConversa = (conversationId: string) =>
  `private-conversation-${conversationId}`;

export const EVENTOS = {
  NOVA_MENSAGEM: 'new-message',
} as const;

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private cliente: Pusher | null = null;
  private avisouChaveAusente = false;

  /**
   * Construção preguiçosa e tolerante à ausência de credencial.
   *
   * O construtor do Pusher LANÇA quando falta chave. Instanciar no boot faria a
   * falta de uma env de tempo real derrubar o serviço inteiro — inclusive as
   * rotas que não têm nada a ver com mensagens. É o mesmo estrago que o
   * `getPusherClient()` do navegador causou na fatia 7, e a mesma correção.
   */
  private obterCliente(): Pusher | null {
    if (this.cliente) return this.cliente;

    const appId = process.env.PUSHER_APP_ID;
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const secret = process.env.PUSHER_SECRET;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

    if (!appId || !key || !secret || !cluster) {
      if (!this.avisouChaveAusente) {
        this.avisouChaveAusente = true;
        this.logger.warn(
          'Credenciais do Pusher ausentes — mensagens são gravadas, mas não há entrega em tempo real.',
        );
      }
      return null;
    }

    this.cliente = new Pusher({ appId, key, secret, cluster, useTLS: true });
    return this.cliente;
  }

  async emitirNovaMensagem(conversationId: string, message: unknown): Promise<void> {
    const cliente = this.obterCliente();
    if (!cliente) return;

    await cliente.trigger(canalDaConversa(conversationId), EVENTOS.NOVA_MENSAGEM, { message });
  }
}
