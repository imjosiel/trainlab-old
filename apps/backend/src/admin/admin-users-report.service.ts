import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
@Injectable()
export class AdminUsersReportService {
  constructor(private readonly prisma: PrismaService) {}
  async get(id: string) {
    const user: any = await this.prisma.user.findUnique({ where: { id }, include: { athleteProfiles: true, partnerAccount: true, subscription: true, _count: { select: { studentsCreated: true, exercises: true, trainingPlansCreated: true, trainingPlansAsAthl: true } } } });
    if (!user) throw new NotFoundException({ error: 'User not found' });
    const receivedPlans: any[] = await this.prisma.trainingPlan.findMany({ where: { OR: [{ athleteId: id }, { student: { userId: id } }] }, take: 200, include: { trainingSessions: { select: { completed: true, exercises: true } } } });
    let totalSessions = 0, completedSessions = 0, totalExercises = 0, completedExercises = 0;
    receivedPlans.forEach((plan: any) => plan.trainingSessions.forEach((sess: any) => {
      totalSessions++; if (sess.completed) completedSessions++;
      try { const exArr = sess.exercises ? JSON.parse(sess.exercises as string) as any[] : []; exArr.forEach((ex) => { totalExercises++; if (ex.completed) completedExercises++; }); } catch {}
    }));
    const athleteStats = { totalPlans: user._count.trainingPlansAsAthl, totalSessions, completedSessions, sessionCompletionRate: totalSessions > 0 ? Math.round(completedSessions / totalSessions * 100) : 0, totalExercises, completedExercises, exerciseCompletionRate: totalExercises > 0 ? Math.round(completedExercises / totalExercises * 100) : 0, lastPlan: receivedPlans[0] ?? null };
    const coachStats = { studentsManaged: user._count.studentsCreated, customExercises: user._count.exercises, plansCreated: user._count.trainingPlansCreated };
    let currentRate: number | null = null; let partnerTierName = 'Indefinido'; let partnerStats: any = null;
    if (user.partnerAccount) {
      if (user.partnerAccount.customCommissionRate !== null) currentRate = user.partnerAccount.customCommissionRate;
      else if (user.partnerAccount.tierId) { const tier: any = await this.prisma.partnerTier.findUnique({ where: { id: user.partnerAccount.tierId } }); if (tier) { currentRate = tier.commissionRate; partnerTierName = tier.name; } }
      if (currentRate === null) currentRate = user.partnerAccount.commissionRate ?? null;
      const [activeSubscriptions, canceledSubscriptions, offers] = await Promise.all([
        this.prisma.partnerSubscription.findMany({ where: { offer: { partnerId: user.partnerAccount.id }, status: { in: ['active','canceling','trialing','past_due'] } }, take: 200, include: { offer: true, user: { select: { id: true, name: true, email: true, image: true } } } }),
        this.prisma.partnerSubscription.findMany({ where: { offer: { partnerId: user.partnerAccount.id }, status: 'canceled' }, take: 100, orderBy: { updatedAt: 'desc' }, include: { user: { select: { id: true, name: true, email: true } } } }),
        this.prisma.partnerOffer.findMany({ where: { partnerId: user.partnerAccount.id }, take: 50, include: { _count: { select: { subscriptions: { where: { status: 'active' } } } } } }),
      ]);
      const grossMrr = (activeSubscriptions as any[]).reduce((acc: number, s: any) => acc + Number(s.offer.price ?? 0), 0);
      const commissionRetained = currentRate !== null ? grossMrr * currentRate : null;
      partnerStats = { revenueTotal: grossMrr, commissionRate: currentRate, partnerTier: partnerTierName, commissionRetained, stripeStatus: user.partnerAccount.stripeAccountStatus ?? 'not_started', payoutsEnabled: user.partnerAccount.payoutsEnabled ?? false, payoutSchedule: user.partnerAccount.payoutSchedule ?? 'weekly', activeStudents: activeSubscriptions.length, churnedStudents: canceledSubscriptions.length, studentsList: (activeSubscriptions as any[]).map((s) => ({ id: s.id, offerName: s.offer.name, price: s.offer.price, user: s.user, email: s.email, createdAt: s.createdAt })), canceledList: (canceledSubscriptions as any[]).map((s) => ({ id: s.id, user: s.user, email: s.email, updatedAt: s.updatedAt })), offers, timestamp: new Date().toISOString() };
    }
    return { user: { id: user.id, name: user.name, email: user.email, image: user.image, roles: user.roles, systemRoles: user.systemRoles, subscriptionStatus: user.subscription?.status ?? null, subscriptionPlan: user.subscription?.plan ?? null, createdAt: user.createdAt, socialLinks: user.socialLinks, bio: user.bio, athleteProfiles: user.athleteProfiles }, athleteStats, coachStats, partnerStats };
  }
}
