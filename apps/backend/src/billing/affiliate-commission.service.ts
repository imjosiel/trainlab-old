import { Injectable, Logger } from '@nestjs/common';

import { NotificationsService } from '@/notifications/notifications.service';
import { PrismaService } from '@/prisma/prisma.service';
import { StripeService } from './stripe.service';

/** `code` só existe em erro do Prisma; entrada não confiável até provar o contrário. */
function ehViolacaoDeUnicidade(erro: unknown): boolean {
  if (typeof erro !== 'object' || erro === null) return false;
  return (erro as { code?: unknown }).code === 'P2002';
}

export interface FaturaPaga {
  id: string;
  amountPaid: number;
}

export type ResultadoDaComissao =
  | { situacao: 'sem_afiliado' }
  | { situacao: 'ja_processada' }
  | { situacao: 'registrada'; status: 'available' | 'pending' | 'reserved'; valorEmCentavos: number };

/**
 * D76 — efeito externo DEPOIS do registro.
 *
 * No legado a ordem era: `findFirst` (checagem), `stripe.transfers.create`
 * (dinheiro sai), e só então o `create` do earning protegido por
 * `@@unique([invoiceId, affiliateId])`. A unicidade existe e funciona — mas
 * guarda a RAZÃO, e a transferência acontece 29 linhas antes dela.
 *
 * Como `checkout.session.completed` e `invoice.payment_succeeded` são eventos
 * DIFERENTES, a idempotência por `event.id` não os deduplica, e o
 * `handleB2BCheckoutComplete` chama esta rotina de propósito como safety net.
 * Em paralelo: os dois passam pela checagem, os dois transferem, um grava e o
 * outro leva P2002 — engolido por um catch mudo (A75, A76).
 *
 * Aqui a reserva vem primeiro, e a mesma unicidade passa a proteger a
 * transferência.
 */
@Injectable()
export class AffiliateCommissionService {
  private readonly logger = new Logger(AffiliateCommissionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly notifications: NotificationsService,
  ) {}

  async processar(
    assinatura: { id: string; offerId: string },
    fatura: FaturaPaga,
  ): Promise<ResultadoDaComissao> {
    const oferta = await this.prisma.partnerOffer.findUnique({
      where: { id: assinatura.offerId },
      select: {
        id: true,
        price: true,
        partner: {
          select: {
            id: true,
            tier: { select: { affiliateCommissionRate: true } },
            affiliatedBy: {
              select: {
                id: true,
                userId: true,
                status: true,
                customCommissionRate: true,
                stripeAccountId: true,
                payoutsEnabled: true,
              },
            },
          },
        },
      },
    });

    const afiliado = oferta?.partner?.affiliatedBy;
    if (!oferta || !afiliado) return { situacao: 'sem_afiliado' };

    // `customCommissionRate` do afiliado tem precedência sobre a do tier — é o
    // acordo individual sobrepondo o padrão comercial.
    const taxa = afiliado.customCommissionRate ?? oferta.partner.tier?.affiliateCommissionRate ?? 0;

    // A comissão incide sobre o preço BASE da oferta, não sobre o total pago:
    // o extra (hora avulsa, por exemplo) não é receita recorrente do afiliado.
    const baseEmCentavos = Math.round(oferta.price * 100);
    const comissaoEmCentavos = Math.round(baseEmCentavos * taxa);

    if (comissaoEmCentavos <= 0) return { situacao: 'sem_afiliado' };

    /* ──────────────────────────────────────────────────────────────────────
     * D76 — a RESERVA vem antes do dinheiro.
     *
     * No legado a ordem era: findFirst, transferir, gravar. A `@@unique
     * ([invoiceId, affiliateId])` existe e funciona — mas ficava 29 linhas
     * DEPOIS da transferência, guardando a razão em vez do dinheiro.
     *
     * `checkout.session.completed` e `invoice.payment_succeeded` são eventos
     * diferentes, então a idempotência por `event.id` não os deduplica — e o
     * handler de checkout chama esta rotina de propósito, como rede de
     * segurança. Em paralelo, os dois passavam pela checagem e os dois
     * transferiam (A75).
     *
     * Com o INSERT primeiro, a mesma chave passa a proteger a transferência.
     * ────────────────────────────────────────────────────────────────────── */
    let reserva: { id: string };
    try {
      reserva = await this.prisma.affiliateEarning.create({
        data: {
          affiliateId: afiliado.id,
          partnerId: oferta.partner.id,
          grossAmount: fatura.amountPaid,
          baseAmount: baseEmCentavos,
          earnedAmount: comissaoEmCentavos,
          commissionRate: taxa,
          subscriptionId: assinatura.id,
          invoiceId: fatura.id,
          // Nasce num status que NÃO parece pago: se o processo morrer entre a
          // reserva e o desfecho, a linha não é lida como comissão liquidada.
          status: 'reserving',
        },
        select: { id: true },
      });
    } catch (erro) {
      if (ehViolacaoDeUnicidade(erro)) return { situacao: 'ja_processada' };
      // D77 — qualquer outra falha SOBE. O legado engolia num catch mudo, e o
      // sintoma era comissão que some sem ninguém saber (A76).
      throw erro;
    }

    /* ──────────────────────────────────────────────────────────────────────
     * Só agora o mundo externo.
     * ────────────────────────────────────────────────────────────────────── */
    // `suspended` bloqueia; qualquer outro status segue. É o que o legado faz
    // (`isSuspended = status === 'suspended'`) e o schema documenta só
    // `approved | suspended`.
    //
    // Eu tinha escrito `=== 'active'` aqui, valor que NÃO EXISTE no schema: com
    // o default real `approved`, toda comissão viraria `reserved` e nada seria
    // transferido. O teste unitário repetia a mesma suposição e por isso passava
    // — quem pegou foi o e2e, ao exigir os nomes reais dos campos.
    const suspenso = afiliado.status === 'suspended';
    const podeTransferir = !suspenso && afiliado.payoutsEnabled && !!afiliado.stripeAccountId;

    let status: 'available' | 'pending' | 'reserved' = 'pending';

    if (suspenso) {
      // Afiliado suspenso: a comissão fica registrada, mas não vira saldo nem
      // transferência. Apagar seria perder o histórico do que ele gerou.
      status = 'reserved';
    } else if (podeTransferir) {
      try {
        // A77 — o id da transferência NÃO é persistido, e isso é paridade com o
        // legado, não esquecimento: `AffiliateEarning` não tem coluna para ele.
        // Fica registrado como lacuna de auditoria — sem o id, não dá para
        // amarrar uma transferência do Stripe à linha que a originou.
        await this.stripe.transferir({
          valorEmCentavos: comissaoEmCentavos,
          destino: afiliado.stripeAccountId!,
          metadata: {
            affiliateId: afiliado.id,
            invoiceId: fatura.id,
            earningId: reserva.id,
          },
        });
        status = 'available';
      } catch (erro) {
        // Falha de transferência é desfecho PREVISTO, não erro de programa: a
        // conta do afiliado pode estar restrita. Vira `pending` e saldo
        // pendente, e alguém repassa depois. Isto é o oposto do D77 de
        // propósito — a distinção é entre "esperado" e "estado desconhecido".
        this.logger.warn(
          `Comissão ${reserva.id} reservada mas não transferida: ${
            erro instanceof Error ? erro.message : String(erro)
          }`,
        );
        status = 'pending';
      }
    }

    // Desfecho e saldo na mesma transação: saldo que não bate com a linha é
    // divergência que ninguém percebe até o afiliado reclamar.
    await this.prisma.$transaction(async (tx) => {
      await tx.affiliateEarning.update({
        where: { id: reserva.id },
        data: {
          status,
          ...(status === 'available' ? { paidAt: new Date() } : {}),
        },
      });

      if (status === 'available') {
        await tx.affiliateAccount.update({
          where: { id: afiliado.id },
          data: { availableBalance: { increment: comissaoEmCentavos } },
        });
      } else if (status === 'pending') {
        await tx.affiliateAccount.update({
          where: { id: afiliado.id },
          data: { pendingBalance: { increment: comissaoEmCentavos } },
        });
      }
    });

    await this.avisar(afiliado.userId, comissaoEmCentavos, status);

    return { situacao: 'registrada', status, valorEmCentavos: comissaoEmCentavos };
  }

  /** Aviso é acessório: derrubar a comissão por causa dele seria trocar o certo pelo menor. */
  private async avisar(userId: string, centavos: number, status: string): Promise<void> {
    try {
      await this.notifications.criar({
        userId,
        type: 'AFFILIATE_COMMISSION',
        title: 'Nova comissão! 💸',
        message:
          status === 'available'
            ? `Você recebeu R$ ${(centavos / 100).toFixed(2)} de comissão.`
            : `Uma comissão de R$ ${(centavos / 100).toFixed(2)} foi registrada e será repassada em breve.`,
        link: '/dashboard/affiliate',
      });
    } catch (erro) {
      this.logger.warn(
        `Comissão registrada, mas o aviso falhou: ${
          erro instanceof Error ? erro.message : String(erro)
        }`,
      );
    }
  }
}
