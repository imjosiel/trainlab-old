import { Injectable } from '@nestjs/common';

import { PrismaService } from '@/prisma/prisma.service';

export type ResultadoDaReivindicacao = 'reivindicado' | 'ja_processado' | 'em_andamento';

/**
 * Depois disto, uma reserva não concluída é considerada abandonada.
 *
 * O número não é arbitrário: precisa ser maior que o handler mais lento (o de
 * comissão de afiliado chama o Stripe) e menor que a janela de reentrega do
 * Stripe, senão a expiração nunca serve para nada.
 */
const CLAIM_EXPIRA_EM_MS = 15 * 60 * 1000;

/** `code` só existe em erro do Prisma; entrada não confiável até provar o contrário. */
function codigoDoPrisma(erro: unknown): string | null {
  if (typeof erro !== 'object' || erro === null) return null;
  const codigo = (erro as { code?: unknown }).code;
  return typeof codigo === 'string' ? codigo : null;
}

const ehViolacaoDeUnicidade = (erro: unknown) => codigoDoPrisma(erro) === 'P2002';
const ehRegistroAusente = (erro: unknown) => codigoDoPrisma(erro) === 'P2025';

/**
 * D75 — reivindicar antes de trabalhar.
 *
 * O legado fazia check-then-act: `isEventProcessed` (SELECT), roda o handler, e
 * só então `markEventProcessed` (INSERT). A chave primária de
 * `ProcessedWebhookEvent` existe e está certa, mas era consultada tarde demais —
 * duas entregas simultâneas do mesmo `event.id` rodavam o handler DUAS vezes
 * antes de a segunda levar violação (A74).
 *
 * Aqui o INSERT vem primeiro e a chave vira TRAVA: quem grava, processa; quem
 * leva P2002, já tem alguém cuidando.
 *
 * Spec: docs/implementation-plans/epic-nest-assinatura-cliente.md
 */
@Injectable()
export class WebhookClaimService {
  constructor(private readonly prisma: PrismaService) {}

  /** Tenta reivindicar o evento. Só quem recebe `reivindicado` deve processar. */
  async reivindicar(eventId: string): Promise<ResultadoDaReivindicacao> {
    try {
      await this.prisma.processedWebhookEvent.create({
        data: { eventId, status: 'processando', claimedAt: new Date() },
      });
      return 'reivindicado';
    } catch (erro) {
      // Só P2002 significa "alguém chegou antes". Qualquer outro erro é falha de
      // infraestrutura e precisa subir: tratá-lo como "já processado" descartaria
      // um pagamento em silêncio.
      if (!ehViolacaoDeUnicidade(erro)) throw erro;
    }

    const existente = await this.prisma.processedWebhookEvent.findUnique({
      where: { eventId },
      select: { status: true, claimedAt: true },
    });

    if (!existente) {
      // A linha sumiu entre o create e a leitura — alguém liberou. Tenta de novo.
      return this.reivindicar(eventId);
    }

    if (existente.status === 'concluido') return 'ja_processado';

    const idade = Date.now() - new Date(existente.claimedAt).getTime();
    if (idade < CLAIM_EXPIRA_EM_MS) return 'em_andamento';

    // Reserva velha e não concluída: o processo que a fez provavelmente morreu.
    // A retomada é CONDICIONAL ao claim antigo — dois processos tentando retomar
    // o mesmo evento morto, só um passa.
    const { count } = await this.prisma.processedWebhookEvent.updateMany({
      where: { eventId, status: 'processando', claimedAt: existente.claimedAt },
      data: { claimedAt: new Date() },
    });

    return count === 1 ? 'reivindicado' : 'em_andamento';
  }

  /** Handler terminou bem: o claim vira registro definitivo. */
  async concluir(eventId: string): Promise<void> {
    await this.prisma.processedWebhookEvent.update({
      where: { eventId },
      data: { status: 'concluido' },
    });
  }

  /**
   * Handler falhou: solta o claim para o Stripe reentregar.
   *
   * Sem isto, um erro transitório trancaria o evento para sempre — o pior dos
   * dois mundos, porque o Stripe desiste depois de algumas tentativas e o
   * pagamento fica sem efeito no banco.
   */
  async liberar(eventId: string): Promise<void> {
    try {
      await this.prisma.processedWebhookEvent.delete({ where: { eventId } });
    } catch (erro) {
      // Já sumiu: outro processo liberou, ou a expiração retomou. Nada a fazer.
      if (!ehRegistroAusente(erro)) throw erro;
    }
  }
}
