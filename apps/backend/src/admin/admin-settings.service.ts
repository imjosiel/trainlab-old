import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
@Injectable()
export class AdminSettingsService {
  constructor(private readonly prisma: PrismaService) {}
  async get() {
    let s: any = await this.prisma.systemSettings.findFirst();
    if (!s) s = await this.prisma.systemSettings.create({ data: {} });
    return s;
  }
  async update(data: any) {
    let s: any = await this.prisma.systemSettings.findFirst();
    if (!s) s = await this.prisma.systemSettings.create({ data: {} });
    const upd: any = {};
    if (data.moduleAthleteEnabled !== undefined) upd.moduleAthleteEnabled = Boolean(data.moduleAthleteEnabled);
    if (data.moduleCoachEnabled !== undefined) upd.moduleCoachEnabled = Boolean(data.moduleCoachEnabled);
    if (data.modulePartnerB2BEnabled !== undefined) upd.modulePartnerB2BEnabled = Boolean(data.modulePartnerB2BEnabled);
    if (data.moduleAffiliateEnabled !== undefined) upd.moduleAffiliateEnabled = Boolean(data.moduleAffiliateEnabled);
    if (data.autoApprovePartners !== undefined) upd.autoApprovePartners = Boolean(data.autoApprovePartners);
    if (data.autoApproveTierChange !== undefined) upd.autoApproveTierChange = Boolean(data.autoApproveTierChange);
    if (data.enableCreditSystem !== undefined) upd.enableCreditSystem = Boolean(data.enableCreditSystem);
    if (data.aiProvider !== undefined) upd.aiProvider = ['groq','gemini'].includes(String(data.aiProvider)) ? String(data.aiProvider) : 'groq';
    return this.prisma.systemSettings.update({ where: { id: s.id }, data: upd });
  }
}
