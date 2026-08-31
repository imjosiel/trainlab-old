import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}
  async get(user: any) {
    const userId = user.id;
    const isTrainer = (user.roles ?? []).includes('PROFESSIONAL');
    const isAthlete = (user.roles ?? []).some((r: string) => ['INDIVIDUAL','CLIENT'].includes(r));
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate()-29); thirtyDaysAgo.setHours(0,0,0,0);
    const planWhere: any = isTrainer ? { trainerId: userId } : { OR: [{ athleteId: userId }, { student: { userId } }] };
    const [allPlans, plansThisMonthCount, trainerAthletes, allSessions] = await Promise.all([
      this.prisma.trainingPlan.findMany({ where: planWhere, select: { id: true, status: true, createdAt: true }, orderBy: { createdAt: 'asc' }, take: 5000 }),
      isTrainer ? this.prisma.trainingPlan.count({ where: { trainerId: userId, createdAt: { gte: startOfMonth } } }) : Promise.resolve(0),
      isTrainer ? this.prisma.student.findMany({ where: { trainerId: userId }, select: { createdAt: true }, take: 1000 }) : Promise.resolve([] as any[]),
      isAthlete ? this.prisma.trainingSession.findMany({ where: { plan: { OR: [{ athleteId: userId }, { student: { userId } }] } }, select: { completed: true, completedAt: true }, take: 2000 }) : Promise.resolve([] as any[]),
    ]);
    const athleteCount = isTrainer ? (trainerAthletes as any[]).length : 0;
    const allPlansRecent = allPlans.filter((p: any) => new Date(p.createdAt) >= thirtyDaysAgo);
    const plansByDay: any[] = [];
    for (let i=0;i<30;i++){ const day=new Date(thirtyDaysAgo); day.setDate(day.getDate()+i); const dayStr=day.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}); const count=allPlansRecent.filter((p:any)=>{const d=new Date(p.createdAt); return d.getFullYear()===day.getFullYear()&&d.getMonth()===day.getMonth()&&d.getDate()===day.getDate()}).length; plansByDay.push({date:dayStr,planos:count});}
    let athleteStats: any = null;
    if (isAthlete) {
      const totalSess = (allSessions as any[]).length;
      const compSess = (allSessions as any[]).filter((s)=>s.completed).length;
      const completionRate = totalSess>0?Math.round(compSess/totalSess*100):0;
      let streak=0; const today=new Date(); today.setHours(0,0,0,0);
      const completedDates=new Set((allSessions as any[]).filter((s)=>s.completed&&s.completedAt).map((s)=>{const d=new Date(s.completedAt); d.setHours(0,0,0,0); return d.getTime();}));
      let checkDay=today.getTime(); if(!completedDates.has(checkDay)) checkDay-=86400000; while(completedDates.has(checkDay)){streak++; checkDay-=86400000;}
      athleteStats={completionRate,streak};
    }
    const statusCounts: any = { PENDING:0,APPROVED:0,REJECTED:0,DELIVERED:0,COMPLETED:0 };
    allPlans.forEach((p:any)=>{ if(p.status in statusCounts) statusCounts[p.status]++; });
    return { totalPlans: allPlans.length, plansThisMonth: plansThisMonthCount, totalAthletes: athleteCount, plansByDay, athleteStats, plansByStatus: statusCounts, activePlans: (statusCounts['APPROVED']??0)+(statusCounts['DELIVERED']??0), completedPlans: statusCounts['COMPLETED']??0 };
  }
}
