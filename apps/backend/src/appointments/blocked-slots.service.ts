import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '@/prisma/prisma.service';
import { ScheduleConfigService } from './schedule-config.service';
import { CreateBlockedSlotBody } from './dtos';

export interface ListBlockedSlotsQuery {
  from?: string;
  to?: string;
}

@Injectable()
export class BlockedSlotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ScheduleConfigService,
  ) {}

  /** Data válida, ou 400. Nunca "ignora e segue" — é o A64. */
  private exigirData(bruto: unknown, campo: string): Date {
    const data = new Date(bruto as string);
    if (Number.isNaN(data.getTime())) {
      throw new BadRequestException({ error: `${campo} inválido. Use formato ISO 8601.` });
    }
    return data;
  }

  private async idDaConfig(trainerId: string): Promise<string> {
    const { config } = await this.config.get(trainerId);
    return config.id as string;
  }

  async list(
    trainerId: string,
    query: ListBlockedSlotsQuery,
  ): Promise<{ blockedSlots: unknown[] }> {
    // A64 — o legado montava o filtro assim:
    //
    //     ...(from && !isNaN(new Date(from).getTime()) ? { gte: new Date(from) } : {})
    //
    // Data inválida não virava erro: o filtro era OMITIDO e a resposta vinha com
    // TUDO. O comentário dizia "validar antes de usar", e o que o código fazia
    // era validar e desistir. Devolver mais dado do que o pedido, calado, é pior
    // que devolver erro — a tela mostra bloqueios de qualquer período achando
    // que mostra o intervalo escolhido.
    const intervalo: { gte?: Date; lte?: Date } = {};
    if (query.from) intervalo.gte = this.exigirData(query.from, 'from');
    if (query.to) intervalo.lte = this.exigirData(query.to, 'to');

    const blockedSlots = await this.prisma.blockedSlot.findMany({
      where: {
        configId: await this.idDaConfig(trainerId),
        ...(Object.keys(intervalo).length > 0 ? { startTime: intervalo } : {}),
      },
      orderBy: { startTime: 'asc' },
    });

    return { blockedSlots };
  }

  async create(
    trainerId: string,
    body: CreateBlockedSlotBody,
  ): Promise<{ blockedSlot: { id: string } }> {
    if (!body.startTime || !body.endTime) {
      throw new BadRequestException({ error: 'startTime e endTime são obrigatórios' });
    }

    const inicio = this.exigirData(body.startTime, 'startTime');
    const fim = this.exigirData(body.endTime, 'endTime');

    // Depois da validação: com Invalid Date, `fim <= inicio` é `false` (NaN não
    // compara), e o bloqueio invertido entraria (BUG-101 no legado).
    if (fim <= inicio) {
      throw new BadRequestException({ error: 'endTime deve ser depois de startTime' });
    }

    const blockedSlot = await this.prisma.blockedSlot.create({
      data: {
        configId: await this.idDaConfig(trainerId),
        label: typeof body.label === 'string' ? body.label : null,
        startTime: inicio,
        endTime: fim,
        isRecurring: body.isRecurring === true,
      },
    });

    return { blockedSlot };
  }

  /**
   * A65 — o legado lia o bloqueio, comparava `configId` e devolvia **403** para
   * o de outro profissional. 403 confirma que a linha existe.
   *
   * Aqui a posse é FILTRO da escrita (D17) e as duas situações — não existe, ou
   * existe e é de outro — dão o mesmo 404 (D16).
   */
  async remove(id: string, trainerId: string): Promise<{ ok: true }> {
    const { count } = await this.prisma.blockedSlot.deleteMany({
      where: { id, configId: await this.idDaConfig(trainerId) },
    });

    if (count === 0) throw new NotFoundException({ error: 'Bloqueio não encontrado' });

    return { ok: true };
  }
}
