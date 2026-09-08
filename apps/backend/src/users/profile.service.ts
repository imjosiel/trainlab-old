import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { SessionPayload } from '@/auth/session-payload';
@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}
  async get(user: SessionPayload, query: any) {
    const userId = query.userId ?? user.id;
    const sport = query.sport;
    if (userId !== user.id) {
      if (!user.isAdmin) {
        if (!user.roles?.includes('PROFESSIONAL')) throw new ForbiddenException({ error: 'Acesso negado' });
        const valid = await this.prisma.student.findFirst({ where: { userId, trainerId: user.id } });
        if (!valid) throw new ForbiddenException({ error: 'Acesso negado. Usuário não é seu aluno.' });
      }
    }
    const where: any = { userId };
    if (sport) where.sportId = sport;
    const profiles = await this.prisma.athleteProfile.findMany({ where, include: { teams: true, sport: true } });
    if (!profiles.length) return { profiles: [], profile: null };
    return { profiles, profile: profiles[0] };
  }
  async upsert(user: SessionPayload, body: any) {
    const { sports, dateOfBirth, height, weight, injuryHistory, currentInjuries, hasHealthIssues, healthIssuesDesc, takesMedication, medicationDesc, acceptedTerms, strengths, weaknesses } = body;
    if (!sports || !Array.isArray(sports) || sports.length === 0) throw new BadRequestException({ error: 'Ao menos um esporte é obrigatório' });
    if (sports.length > 5) throw new BadRequestException({ error: 'Limite de esportes por perfil excedido (Máx: 5)' });
    const existingProfiles: any[] = await this.prisma.athleteProfile.findMany({ where: { userId: user.id }, include: { teams: true } });
    const providedSportIds = sports.map((s: any) => s.sportId);
    const profilesToDelete = existingProfiles.filter((p) => !providedSportIds.includes(p.sportId));
    if (profilesToDelete.length) await this.prisma.athleteProfile.deleteMany({ where: { id: { in: profilesToDelete.map((p) => p.id) } } });
    const updated: any[] = [];
    for (const sport of sports) {
      if (!sport.sportId) throw new BadRequestException({ error: 'Cada esporte deve conter sportId.' });
      const profileData: any = {
        userId: user.id,
        sportId: sport.sportId,
        dateOfBirth: dateOfBirth && !isNaN(new Date(dateOfBirth).getTime()) ? new Date(dateOfBirth) : null,
        height: height && !isNaN(parseFloat(String(height))) ? Math.min(Math.max(parseFloat(String(height)), 50), 300) : null,
        weight: weight && !isNaN(parseFloat(String(weight))) ? Math.min(Math.max(parseFloat(String(weight)), 20), 500) : null,
        injuryHistory: injuryHistory ? String(injuryHistory).substring(0, 2000) : null,
        currentInjuries: currentInjuries ? String(currentInjuries).substring(0, 1000) : null,
        hasHealthIssues: hasHealthIssues ?? false,
        healthIssuesDesc: healthIssuesDesc ? String(healthIssuesDesc).substring(0, 1000) : null,
        takesMedication: takesMedication ?? false,
        medicationDesc: medicationDesc ? String(medicationDesc).substring(0, 500) : null,
        acceptedTerms: acceptedTerms ?? false,
        strengths: strengths ? String(strengths).substring(0, 1000) : null,
        weaknesses: weaknesses ? String(weaknesses).substring(0, 1000) : null,
        goals: sport.goals ? String(sport.goals).substring(0, 1000) : null,
        trainingDaysPerWeek: sport.trainingDaysPerWeek && !isNaN(parseInt(String(sport.trainingDaysPerWeek), 10)) ? parseInt(String(sport.trainingDaysPerWeek), 10) : null,
        trainingHoursPerDay: sport.trainingHoursPerDay && !isNaN(parseFloat(String(sport.trainingHoursPerDay))) ? parseFloat(String(sport.trainingHoursPerDay)) : null,
        trainingFocus: Array.isArray(sport.trainingFocus) ? sport.trainingFocus : [],
        position: sport.position ? String(sport.position).substring(0, 50) : null,
        technicalLevel: sport.technicalLevel ?? null,
        yearsPlaying: sport.yearsPlaying && !isNaN(parseInt(String(sport.yearsPlaying), 10)) ? parseInt(String(sport.yearsPlaying), 10) : null,
        dominantFoot: sport.dominantFoot ?? null,
      };
      const safeTeams = Array.isArray(sport.teams) ? (sport.teams as unknown[]).slice(0, 15).map((t) => String(t).substring(0, 50)) : [];
      const teamsOp = { connectOrCreate: safeTeams.map((t) => ({ where: { name: t }, create: { name: t } })) };
      const existing = existingProfiles.find((p) => p.sportId === sport.sportId);
      let saved;
      if (existing) saved = await this.prisma.athleteProfile.update({ where: { id: existing.id }, data: { ...profileData, teams: { set: [], ...teamsOp } } });
      else saved = await this.prisma.athleteProfile.create({ data: { ...profileData, teams: teamsOp } });
      updated.push(saved);
    }
    return { message: 'Perfil atualizado com sucesso', profiles: updated };
  }
}
