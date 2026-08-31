import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
@Injectable()
export class AdminUsersActionsService {
  constructor(private readonly prisma: PrismaService) {}
  async atualizar(id: string, actor: any, body: any) {
    const { action, offerId } = body;
    const user: any = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException({ error: 'Usuário não encontrado' });
    if (action === 'toggle_admin') {
      if (!actor.systemRoles?.includes('ADMIN')) throw new ForbiddenException({ error: 'Apenas administradores podem alterar permissões' });
      if (user.id === actor.id) throw new BadRequestException({ error: 'Você não pode alterar seu próprio status' });
      const isAdmin = (user.systemRoles ?? []).includes('ADMIN');
      const newRoles = (isAdmin ? ['USER'] : ['ADMIN']) as any;
      const updated = await this.prisma.user.update({ where: { id }, data: { systemRoles: newRoles } });
      await this.prisma.auditLog.create({ data: { actorId: actor.id, actorName: actor.name ?? actor.email ?? 'Admin', action: 'USER_SYSTEM_ROLE_CHANGED', entity: 'User', entityId: id, details: { before: user.systemRoles, after: newRoles } } }).catch(()=>{});
      return { success: true, user: updated };
    }
    if (action === 'grant_premium') {
      const endsAt = new Date(new Date().setFullYear(new Date().getFullYear()+1));
      const grantId = `manual_grant_${Date.now()}`;
      await this.prisma.userSubscription.upsert({ where: { userId: id }, create: { userId: id, plan: 'premium', status: 'active', stripeSubId: grantId, endsAt }, update: { plan: 'premium', status: 'active', stripeSubId: grantId, endsAt } });
      return { success: true };
    }
    if (action === 'revoke_premium') {
      await this.prisma.userSubscription.upsert({ where: { userId: id }, create: { userId: id, status: 'inactive', plan: 'base' }, update: { status: 'inactive', plan: 'base', stripeSubId: null, endsAt: null } });
      return { success: true };
    }
    if (action === 'grant_test_b2b') {
      if (!offerId) throw new BadRequestException({ error: 'Oferta não especificada' });
      const offer: any = await this.prisma.partnerOffer.findUnique({ where: { id: offerId }, include: { partner: true } });
      if (!offer) throw new NotFoundException({ error: 'Oferta não encontrada' });
      const existing = await this.prisma.partnerSubscription.findFirst({ where: { userId: id, offerId: offer.id, status: { in: ['active','trialing','past_due'] } } });
      if (existing) throw new BadRequestException({ error: 'Já possui assinatura ativa para esta oferta.' });
      const userSub: any = await this.prisma.userSubscription.findUnique({ where: { userId: id }, select: { stripeCustomerId: true } }).catch(()=>null);
      const sub = await this.prisma.partnerSubscription.create({ data: { offerId: offer.id, userId: id, email: user.email ?? '', stripeSubscriptionId: `test_grant_${Date.now()}`, stripeCustomerId: userSub?.stripeCustomerId ?? `cus_manual_${id}`, status: 'active' } });
      return { success: true, subscription: sub };
    }
    throw new BadRequestException({ error: 'Ação inválida' });
  }
  async remover(id: string, actor: any) {
    if (!actor.systemRoles?.includes('ADMIN')) throw new ForbiddenException({ error: 'Apenas administradores podem excluir' });
    if (id === actor.id) throw new BadRequestException({ error: 'Você não pode excluir sua própria conta' });
    const user: any = await this.prisma.user.findUnique({ where: { id }, select: { id: true, email: true, name: true, roles: true } });
    if (!user) throw new NotFoundException({ error: 'Usuário não encontrado' });
    await this.prisma.user.delete({ where: { id } });
    await this.prisma.auditLog.create({ data: { actorId: actor.id, actorName: actor.name ?? actor.email ?? 'Admin', action: 'USER_DELETED', entity: 'User', entityId: id, details: { deletedUser: user.email } } }).catch(()=>{});
    return { success: true };
  }
}
