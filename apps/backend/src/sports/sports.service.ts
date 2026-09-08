import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@/prisma/prisma.service';
import { DEFAULT_SPORTS, POSITIONS_BY_SLUG } from './default-sports';
import { CreateSportInput, UpdateSportInput } from './dtos';

/**
 * Limites de slug divergem entre criar e editar no legado (achado A4):
 * 50 no POST, 30 no PATCH. Portado fielmente — unificar é decisão de produto.
 */
const SLUG_CREATE = /^[a-z0-9-]{1,50}$/;
const SLUG_UPDATE = /^[a-z0-9-]{1,30}$/;

@Injectable()
export class SportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET público. O merge com DEFAULT_SPORTS (D12) é o que faz um banco
   * recém-migrado, sem seed de posições, devolver esporte usável ao formulário
   * de anamnese. O que está no banco vence o default.
   */
  async listActive() {
    const sports = await this.prisma.sport.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      take: 50,
    });

    const merged = sports.map((sport) => {
      if (sport.positions && sport.positions.length > 0) return sport;
      return { ...sport, positions: POSITIONS_BY_SLUG[sport.slug] ?? [] };
    });

    return { sports: merged };
  }

  /** GET admin: sem filtro de isActive, com a contagem de perfis vinculados. */
  async listAll() {
    return this.prisma.sport.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { profiles: true } } },
    });
  }

  async create(input: CreateSportInput) {
    const name = input.name?.trim();
    const slug = input.slug?.trim();

    if (!name || !slug) {
      throw new BadRequestException({ error: 'Nome e slug são obrigatórios.' });
    }
    if (!SLUG_CREATE.test(slug)) {
      throw new BadRequestException({
        error: 'Slug inválido. Use letras minúsculas, números e hífens.',
      });
    }

    const existing = await this.prisma.sport.findUnique({ where: { slug } });
    if (existing) {
      throw new ConflictException({ error: 'Já existe um esporte com este slug.' });
    }

    return this.prisma.sport.create({
      data: {
        name,
        slug,
        positions: Array.isArray(input.positions) ? input.positions : [],
        isActive: true,
      },
    });
  }

  /**
   * Reimporta os padrões da plataforma. Em paralelo de propósito: a versão
   * sequencial executava uma query por esporte (BUG-54 no legado).
   */
  async syncDefaults() {
    await Promise.all(
      DEFAULT_SPORTS.map((sport) =>
        this.prisma.sport.upsert({
          where: { slug: sport.slug },
          update: { name: sport.name, positions: [...sport.positions], isActive: true },
          create: { ...sport, positions: [...sport.positions], isActive: true },
        }),
      ),
    );

    return {
      message: `Sincronização concluída: ${DEFAULT_SPORTS.length} esportes sincronizados com sucesso.`,
      synced: DEFAULT_SPORTS.length,
    };
  }

  async update(id: string, input: UpdateSportInput) {
    const sport = await this.prisma.sport.findUnique({ where: { id } });
    if (!sport) throw new NotFoundException({ error: 'Esporte não encontrado' });

    // Só ao DESATIVAR. Ativar não pode ser bloqueado por vínculo — quem tem
    // atleta vinculado é justamente quem precisa do esporte ativo.
    if (input.isActive === false) {
      const athleteCount = await this.prisma.athleteProfile.count({ where: { sportId: id } });
      if (athleteCount > 0) {
        throw new BadRequestException({
          error: `Não é possível desativar este esporte pois existem ${athleteCount} atletas vinculados.`,
          canDelete: false,
        });
      }
    }

    if (
      input.name !== undefined &&
      (typeof input.name !== 'string' || input.name.trim().length === 0 || input.name.length > 50)
    ) {
      throw new BadRequestException({
        error: 'O campo "name" deve ter entre 1 e 50 caracteres.',
      });
    }
    if (input.slug !== undefined && !SLUG_UPDATE.test(input.slug)) {
      throw new BadRequestException({
        error:
          'O campo "slug" deve ter entre 1 e 30 caracteres (letras minúsculas, números e hífens).',
      });
    }

    // Unicidade checada aqui, não deixada para o P2002 do banco — que cairia no
    // handler genérico e viraria 500 (BUG-62 no legado).
    if (input.slug !== undefined) {
      const conflict = await this.prisma.sport.findUnique({ where: { slug: input.slug } });
      if (conflict && conflict.id !== id) {
        throw new ConflictException({
          error: `Já existe um esporte com o slug '${input.slug}'.`,
        });
      }
    }

    return this.prisma.sport.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.slug !== undefined && { slug: input.slug }),
        ...(input.isActive !== undefined && { isActive: Boolean(input.isActive) }),
        ...(input.positions !== undefined && {
          positions: Array.isArray(input.positions) ? input.positions : [],
        }),
      },
    });
  }

  async remove(id: string) {
    // Existência ANTES de vínculo: invertido, um id inexistente contaria perfis
    // de nada e responderia 400 em vez de 404.
    const sport = await this.prisma.sport.findUnique({ where: { id } });
    if (!sport) throw new NotFoundException({ error: 'Esporte não encontrado' });

    const athleteCount = await this.prisma.athleteProfile.count({ where: { sportId: id } });
    if (athleteCount > 0) {
      throw new BadRequestException({
        error: `Exclusão bloqueada: Existem ${athleteCount} atletas vinculados a este esporte. Desative-o em vez de excluir.`,
      });
    }

    await this.prisma.sport.delete({ where: { id } });
    return { success: true, message: 'Esporte excluído com sucesso.' };
  }
}
