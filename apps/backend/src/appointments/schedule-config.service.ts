import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '@/prisma/prisma.service';
import { inteiroNaFaixa } from '@/common/numeros';

export interface UpdateScheduleConfigBody {
  workStartHour?: unknown;
  workEndHour?: unknown;
  workDays?: unknown;
}

const PADRAO = { workStartHour: 7, workEndHour: 22, workDays: [1, 2, 3, 4, 5] };
const COM_BLOQUEIOS = { blockedSlots: { orderBy: { startTime: 'asc' } } } as const;

@Injectable()
export class ScheduleConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async get(trainerId: string): Promise<{ config: Record<string, unknown> }> {
    const config = await this.prisma.trainerScheduleConfig.upsert({
      where: { trainerId },
      update: {},
      create: { trainerId, ...PADRAO },
      include: COM_BLOQUEIOS,
    });

    return { config };
  }

  async update(
    trainerId: string,
    body: UpdateScheduleConfigBody,
  ): Promise<{ config: Record<string, unknown> }> {
    // D65 — o MESMO helper nos três campos.
    //
    // O legado tinha a checagem de tipo só em `workDays` (BUG-102) e deixou as
    // horas com validação apenas de faixa. `'' < 0` é false, `'' > 23` é false:
    // passava, e `Number('')` gravava 0. Medido ao vivo: HTTP 200, expediente
    // começando à meia-noite (A58).
    const horas: Array<keyof UpdateScheduleConfigBody> = ['workStartHour', 'workEndHour'];
    for (const campo of horas) {
      const valor = body[campo];
      if (valor === undefined) continue;
      if (!inteiroNaFaixa(valor, 0, 23)) {
        throw new BadRequestException({ error: `${campo} inválido (inteiro de 0 a 23)` });
      }
    }

    if (body.workDays !== undefined) {
      const dias = body.workDays;
      if (!Array.isArray(dias) || dias.some((d) => !inteiroNaFaixa(d, 0, 6))) {
        throw new BadRequestException({ error: 'workDays inválido (array de inteiros 0–6)' });
      }
    }

    // Garante a linha antes do update — o legado fazia igual, e sem isso o
    // primeiro PATCH de um profissional novo estoura em vez de criar.
    await this.get(trainerId);

    const config = await this.prisma.trainerScheduleConfig.update({
      // Sempre a linha do requisitante. `trainerId` do corpo é ignorado por
      // construção: ele nunca é lido daqui.
      where: { trainerId },
      data: {
        ...(body.workStartHour !== undefined ? { workStartHour: body.workStartHour as number } : {}),
        ...(body.workEndHour !== undefined ? { workEndHour: body.workEndHour as number } : {}),
        ...(body.workDays !== undefined ? { workDays: body.workDays as number[] } : {}),
      },
      include: COM_BLOQUEIOS,
    });

    return { config };
  }
}
