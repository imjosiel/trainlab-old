import { Injectable, Logger } from '@nestjs/common';

export interface Transferencia {
  id: string;
}

export interface EventoStripe {
  id: string;
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: { object: any };
  account?: string;
}

/**
 * Porta do Stripe (D66 aplicado a dinheiro).
 *
 * Mesma razão de teste das portas anteriores — `RealtimeService`, `CalendarService`:
 * as propriedades desta fatia são sobre ORDEM ("não transferiu antes de reservar")
 * e sobre CONTAGEM ("transferiu uma vez, não duas"), e nenhuma delas é
 * demonstrável com o SDK chamado de dentro do serviço de domínio.
 *
 * Aqui a porta importa mais que nas outras: `transferir` move dinheiro de
 * verdade e não tem desfazer barato.
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);

  /* eslint-disable @typescript-eslint/no-unused-vars */

  /** Verifica a assinatura do webhook. Lança se o corpo não bate com o segredo. */
  verificarAssinatura(corpo: string, assinatura: string | null): EventoStripe {
    throw new Error('não implementado');
  }

  async transferir(entrada: {
    valorEmCentavos: number;
    destino: string;
    metadata: Record<string, string>;
  }): Promise<Transferencia> {
    throw new Error('não implementado');
  }

  async cancelarAssinatura(stripeSubscriptionId: string): Promise<void> {
    throw new Error('não implementado');
  }
}
