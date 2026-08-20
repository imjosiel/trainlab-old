import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '.prisma-backend/client';

import { SessionPayload } from '@/auth/session-payload';
import { ROLES, SYSTEM_ROLES } from '@/common/constants';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '@/notifications/notifications.service';
import { StripeService } from '@/billing/stripe.service';

export interface CandidatarBody {
  motivation?: unknown;
}

export interface CriarSessaoDeOnboardingBody {
  components?: unknown;
}

export interface ResultadoDeSincronizacao {
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  stripeAccountStatus: string;
}

type AllowedComponent = 'account_onboarding' | 'account_management' | 'payments' | 'payouts';

const COMPONENT_MAP: Record<AllowedComponent, Record<string, { enabled: boolean }>> = {
  account_onboarding: { account_onboarding: { enabled: true } },
  account_management: { account_management: { enabled: true } },
  payments: { payments: { enabled: true } },
  payouts: { payouts: { enabled: true } },
};

/**
 * Fatia 21 — candidatura e Stripe Connect do parceiro (docs/implementation-plans/epic-nest-partner-connect.md).
 */
@Injectable()
export class PartnerConnectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly stripe: StripeService,
  ) {}

  async candidatar(user: SessionPayload, body: CandidatarBody): Promise<{ success: true; account: unknown }> {
    if (!user.roles?.includes(ROLES.PROFESSIONAL)) {
      throw new ForbiddenException({ error: 'Acesso restrito a profissionais.' });
    }

    const settings = await this.prisma.systemSettings.findFirst({ select: { autoApprovePartners: true } });
    const autoApprove = settings?.autoApprovePartners === true;

    const motivation = typeof body.motivation === 'string' ? body.motivation : undefined;

    if (!autoApprove && (!motivation || motivation.trim().length < 20)) {
      throw new BadRequestException({ error: 'A motivação deve ter pelo menos 20 caracteres.' });
    }
    if (motivation && motivation.trim().length > 2000) {
      throw new BadRequestException({ error: 'A motivação não pode exceder 2000 caracteres.' });
    }

    const existente = await this.prisma.partnerAccount.findUnique({ where: { userId: user.id } });

    if (existente) {
      if (existente.status !== 'rejected') {
        throw new BadRequestException({ error: 'Você já possui uma candidatura em andamento.' });
      }
      return this.reaplicar(user, motivation);
    }

    return this.criarNova(user, motivation, autoApprove);
  }

  private async reaplicar(user: SessionPayload, motivation?: string): Promise<{ success: true; account: unknown }> {
    const rolesSemParceiro = (user.roles ?? []).filter((r) => r !== ROLES.PARTNER) as UserRole[];

    const [conta] = await this.prisma.$transaction([
      this.prisma.partnerAccount.update({
        where: { userId: user.id },
        data: { motivation: motivation ?? '', status: 'pending', rejectionReason: null, contractAcceptedAt: new Date() },
      }),
      this.prisma.user.update({ where: { id: user.id }, data: { roles: rolesSemParceiro } }),
    ]);

    await this.avisarAdmins(
      'PARTNER_REAPPLICATION',
      '🔄 Nova candidatura de parceiro (re-aplicação)',
      `${user.name ?? user.email} reaplicou após rejeição. Revise no painel de parceiros.`,
    );

    return { success: true, account: conta };
  }

  private async criarNova(
    user: SessionPayload,
    motivation: string | undefined,
    autoApprove: boolean,
  ): Promise<{ success: true; account: unknown }> {
    const tierPadrao = await this.prisma.partnerTier.findFirst({ where: { isDefault: true, isActive: true } });
    const status = autoApprove ? 'approved' : 'pending';

    const rolesComParceiro = ((user.roles ?? []).includes(ROLES.PARTNER)
      ? (user.roles ?? [])
      : [...(user.roles ?? []), ROLES.PARTNER]) as UserRole[];

    const [conta] = await this.prisma.$transaction([
      this.prisma.partnerAccount.create({
        data: {
          userId: user.id,
          motivation: motivation ?? '',
          status,
          partnerTier: tierPadrao?.slug ?? 'starter',
          contractAcceptedAt: new Date(),
          ...(tierPadrao ? { tierId: tierPadrao.id } : {}),
        },
      }),
      ...(autoApprove ? [this.prisma.user.update({ where: { id: user.id }, data: { roles: rolesComParceiro } })] : []),
    ]);

    if (!autoApprove) {
      await this.avisarAdmins(
        'PARTNER_APPLICATION',
        '🌟 Nova candidatura de parceiro',
        `${user.name ?? user.email} aplicou para ser parceiro B2B. Revise no painel de parceiros.`,
      );
    }

    return { success: true, account: conta };
  }

  private async avisarAdmins(type: string, title: string, message: string): Promise<void> {
    const admins = await this.prisma.user.findMany({
      where: { systemRoles: { has: SYSTEM_ROLES.ADMIN } },
      select: { id: true },
    });
    await Promise.all(
      admins.map((admin) =>
        this.notifications.criar({ userId: admin.id, type, title, message, link: '/admin/partners' }),
      ),
    );
  }

  async configurarConta(user: SessionPayload): Promise<{ stripeAccountId: string }> {
    const isAdmin = user.isAdmin;
    const isPartner = Boolean(user.roles?.includes(ROLES.PARTNER));

    let conta = await this.prisma.partnerAccount.findUnique({ where: { userId: user.id } });

    if (!conta && (isAdmin || isPartner)) {
      const tierPadrao = await this.prisma.partnerTier.findFirst({ where: { isDefault: true, isActive: true } });
      conta = await this.prisma.partnerAccount
        .create({
          data: {
            userId: user.id,
            status: 'approved',
            partnerTier: tierPadrao?.slug ?? 'starter',
            stripeAccountId: null,
            payoutsEnabled: false,
            chargesEnabled: false,
            ...(tierPadrao ? { tierId: tierPadrao.id } : {}),
          },
        })
        .catch(async (erro: { code?: string }) => {
          if (erro.code === 'P2002') {
            return this.prisma.partnerAccount.findUnique({ where: { userId: user.id } });
          }
          throw erro;
        });
    }

    if (!conta) throw new NotFoundException({ error: 'Candidatura de parceiro não encontrada.' });
    if (conta.status !== 'approved' && !isAdmin) {
      throw new ForbiddenException({ error: 'Sua candidatura ainda não foi aprovada.' });
    }
    if (conta.stripeAccountId) return { stripeAccountId: conta.stripeAccountId };

    const contaConectada = await this.stripe.buscarOuCriarContaConectada({
      userId: user.id,
      email: user.email,
      partnerAccountId: conta.id,
    });

    await this.prisma.partnerAccount.update({
      where: { id: conta.id },
      data: { stripeAccountId: contaConectada.id, stripeAccountStatus: 'pending' },
    });

    return { stripeAccountId: contaConectada.id };
  }

  async criarSessaoDeOnboarding(
    user: SessionPayload,
    body: CriarSessaoDeOnboardingBody,
  ): Promise<{ clientSecret: string | null }> {
    const conta = await this.prisma.partnerAccount.findUnique({
      where: { userId: user.id },
      select: { stripeAccountId: true, status: true },
    });

    if (!conta?.stripeAccountId) {
      throw new BadRequestException({ error: 'Conta Stripe Connect não configurada. Complete o setup primeiro.' });
    }
    if (conta.status !== 'approved') {
      throw new ForbiddenException({ error: 'Parceiro não aprovado.' });
    }

    const components = (Array.isArray(body.components) ? body.components : ['account_onboarding']) as AllowedComponent[];

    const enabledComponents = components.reduce<Record<string, { enabled: boolean }>>((acc, componente) => {
      if (COMPONENT_MAP[componente]) return { ...acc, ...COMPONENT_MAP[componente] };
      return acc;
    }, {});

    if (Object.keys(enabledComponents).length === 0) {
      throw new BadRequestException({
        error: `Nenhum componente válido especificado. Use: ${Object.keys(COMPONENT_MAP).join(', ')}.`,
      });
    }

    return this.stripe.criarSessaoDeConta(conta.stripeAccountId, enabledComponents);
  }

  async sincronizar(user: SessionPayload): Promise<ResultadoDeSincronizacao> {
    const conta = await this.prisma.partnerAccount.findUnique({
      where: { userId: user.id },
      select: { id: true, stripeAccountId: true, status: true },
    });

    if (!conta?.stripeAccountId) {
      throw new BadRequestException({ error: 'Conta Stripe Connect não configurada.' });
    }

    const statusStripe = await this.stripe.buscarContaConectada(conta.stripeAccountId);

    let stripeAccountStatus: string;
    if (statusStripe.payoutsEnabled && statusStripe.chargesEnabled) {
      stripeAccountStatus = 'active';
    } else if (statusStripe.disabledReason) {
      stripeAccountStatus = 'restricted';
    } else {
      stripeAccountStatus = 'pending';
    }

    await this.prisma.partnerAccount.update({
      where: { id: conta.id },
      data: {
        payoutsEnabled: statusStripe.payoutsEnabled,
        chargesEnabled: statusStripe.chargesEnabled,
        stripeAccountStatus,
      },
    });

    return {
      payoutsEnabled: statusStripe.payoutsEnabled,
      chargesEnabled: statusStripe.chargesEnabled,
      stripeAccountStatus,
    };
  }
}
