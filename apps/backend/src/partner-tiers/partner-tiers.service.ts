import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { inteiroNaFaixa, numeroNaFaixa } from '@/common/numeros';
import { PrismaService } from '@/prisma/prisma.service';

export interface TierBody {
  name?: unknown;
  slug?: unknown;
  description?: unknown;
  commissionRate?: unknown;
  minPrice?: unknown;
  price?: unknown;
  isActive?: unknown;
  isDefault?: unknown;
  maxAthletes?: unknown;
  maxPlansPerMonth?: unknown;
  payoutSchedule?: unknown;
  payoutDelayDays?: unknown;
  allowFlexibleDistribution?: unknown;
  allowHourlyRate?: unknown;
  hourlyRatePolicy?: unknown;
  creditsPerPeriod?: unknown;
  creditResetPeriod?: unknown;
  videoQualityHeights?: unknown;
}

const MAX_NOME = 50;
const SLUG_VALIDO = /^[a-z0-9-]+$/;
const DINHEIRO_MAX = Number.MAX_SAFE_INTEGER;
const ALTURAS_VALIDAS = [360, 480, 720, 1080, 1440, 2160];

/**
 * Regras dos campos numéricos, numa tabela (D71).
 *
 * O A68 não foi "alguém esqueceu de validar `price`": foi validação escrita
 * campo a campo, com guarda em três dos cinco. Enquanto a regra for uma tabela,
 * campo novo entra aqui e é validado; enquanto for um `if` por campo, campo novo
 * nasce sem guarda.
 *
 * `anulavel` distingue o que o schema deixa ser `null` — `creditsPerPeriod` é
 * `Int?` e `null` é como a tela limpa o campo. Nos outros, `null` é lixo.
 */
const CAMPOS_NUMERICOS = {
  commissionRate: { min: 0, max: 1, inteiro: false, anulavel: false, obrigatorio: true },
  price: { min: 0, max: DINHEIRO_MAX, inteiro: false, anulavel: false, obrigatorio: false },
  minPrice: { min: 0, max: DINHEIRO_MAX, inteiro: false, anulavel: false, obrigatorio: false },
  payoutDelayDays: { min: 0, max: 365, inteiro: true, anulavel: false, obrigatorio: false },
  creditsPerPeriod: { min: 0, max: 1_000_000, inteiro: true, anulavel: true, obrigatorio: false },
  maxAthletes: { min: 0, max: 1_000_000, inteiro: true, anulavel: true, obrigatorio: false },
  maxPlansPerMonth: { min: 0, max: 1_000_000, inteiro: true, anulavel: true, obrigatorio: false },
} as const;

type CampoNumerico = keyof typeof CAMPOS_NUMERICOS;

/** Campos que a landing pode ver. Explícito — modelo novo não vaza sozinho (A71). */
const SELECT_PUBLICO = {
  id: true,
  slug: true,
  name: true,
  description: true,
  price: true,
  commissionRate: true,
  minPrice: true,
  maxAthletes: true,
  maxPlansPerMonth: true,
  allowFlexibleDistribution: true,
  allowHourlyRate: true,
  creditsPerPeriod: true,
  creditResetPeriod: true,
} as const;

/** O que o parceiro logado vê ao escolher tier. */
const SELECT_DO_PARCEIRO = {
  ...SELECT_PUBLICO,
  payoutSchedule: true,
  isDefault: true,
} as const;

@Injectable()
export class PartnerTiersService {
  constructor(private readonly prisma: PrismaService) {}

  /* ────────────────────────────────────────────────────────────────────────
   * Validação
   * ──────────────────────────────────────────────────────────────────────── */

  /**
   * Devolve os campos numéricos já validados, ou lança 400 no primeiro inválido.
   *
   * `undefined` significa "não veio no corpo" e some do resultado — é o que
   * permite o PUT parcial não zerar campo que ninguém mandou.
   */
  private validarNumeros(
    body: TierBody,
    exigirObrigatorios: boolean,
  ): Partial<Record<CampoNumerico, number | null>> {
    const saida: Partial<Record<CampoNumerico, number | null>> = {};

    for (const [campo, regra] of Object.entries(CAMPOS_NUMERICOS) as [
      CampoNumerico,
      (typeof CAMPOS_NUMERICOS)[CampoNumerico],
    ][]) {
      const valor = body[campo];

      if (valor === undefined) {
        // `obrigatorio` só vale na criação: no PUT, campo ausente é "não mexe".
        if (regra.obrigatorio && exigirObrigatorios) {
          throw new BadRequestException({ error: `${campo} é obrigatório` });
        }
        continue;
      }

      if (valor === null) {
        if (!regra.anulavel) {
          throw new BadRequestException({ error: `${campo} não pode ser nulo` });
        }
        saida[campo] = null;
        continue;
      }

      const valido = regra.inteiro
        ? inteiroNaFaixa(valor, regra.min, regra.max)
        : numeroNaFaixa(valor, regra.min, regra.max);

      if (!valido) {
        throw new BadRequestException({
          error: `${campo} inválido (${regra.inteiro ? 'inteiro' : 'número'} entre ${regra.min} e ${regra.max})`,
        });
      }

      saida[campo] = valor as number;
    }

    return saida;
  }

  private validarIdentidade(body: TierBody, exigirTodos: boolean): { name?: string; slug?: string } {
    const saida: { name?: string; slug?: string } = {};

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        throw new BadRequestException({ error: 'name é obrigatório' });
      }
      if (body.name.length > MAX_NOME) {
        throw new BadRequestException({ error: `name deve ter no máximo ${MAX_NOME} caracteres.` });
      }
      saida.name = body.name;
    } else if (exigirTodos) {
      throw new BadRequestException({ error: 'name é obrigatório' });
    }

    if (body.slug !== undefined) {
      const slug = typeof body.slug === 'string' ? body.slug.toLowerCase() : '';
      if (!slug || slug.length > MAX_NOME || !SLUG_VALIDO.test(slug)) {
        throw new BadRequestException({
          error: `slug deve ter no máximo ${MAX_NOME} chars e conter apenas letras minúsculas, números e hífens.`,
        });
      }
      saida.slug = slug;
    } else if (exigirTodos) {
      throw new BadRequestException({ error: 'slug é obrigatório' });
    }

    return saida;
  }

  private alturasDeVideo(bruto: unknown): number[] | undefined {
    if (bruto === undefined) return undefined;
    if (!Array.isArray(bruto)) {
      throw new BadRequestException({ error: 'videoQualityHeights deve ser uma lista' });
    }
    return bruto
      .filter((h) => ALTURAS_VALIDAS.includes(Number(h)))
      .map(Number)
      .sort((a, b) => a - b);
  }

  /** Campos livres, sem regra numérica. `undefined` é "não mexe". */
  private camposSoltos(body: TierBody) {
    return {
      ...(body.description !== undefined
        ? { description: body.description === null ? null : String(body.description) }
        : {}),
      ...(body.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}),
      ...(body.payoutSchedule !== undefined ? { payoutSchedule: String(body.payoutSchedule) } : {}),
      ...(body.allowFlexibleDistribution !== undefined
        ? { allowFlexibleDistribution: Boolean(body.allowFlexibleDistribution) }
        : {}),
      ...(body.allowHourlyRate !== undefined
        ? { allowHourlyRate: Boolean(body.allowHourlyRate) }
        : {}),
      ...(body.hourlyRatePolicy !== undefined
        ? { hourlyRatePolicy: String(body.hourlyRatePolicy) }
        : {}),
      ...(body.creditResetPeriod !== undefined
        ? {
            creditResetPeriod: body.creditResetPeriod ? String(body.creditResetPeriod) : null,
          }
        : {}),
    };
  }

  /* ────────────────────────────────────────────────────────────────────────
   * Leitura — D73: listagem lista, e só.
   * ──────────────────────────────────────────────────────────────────────── */

  async listarAtivos(): Promise<{ tiers: unknown[] }> {
    const tiers = await this.prisma.partnerTier.findMany({
      where: { isActive: true },
      select: SELECT_DO_PARCEIRO,
      orderBy: { price: 'asc' },
    });
    return { tiers };
  }

  async listarPublicos(): Promise<{ tiers: unknown[] }> {
    const tiers = await this.prisma.partnerTier.findMany({
      where: { isActive: true },
      select: SELECT_PUBLICO,
      orderBy: { price: 'asc' },
    });
    return { tiers };
  }

  /**
   * D73 — o legado semeava aqui: se faltasse o slug `starter`, o GET criava.
   * Carregar a tela de admin tinha efeito colateral, e o `catch` do seed engolia
   * qualquer erro para tentar de novo sem dois campos. Semear é passo de
   * migração, não de leitura.
   */
  async listarTodos(): Promise<{ tiers: unknown[] }> {
    const tiers = await this.prisma.partnerTier.findMany({
      orderBy: { commissionRate: 'asc' },
    });
    return { tiers };
  }

  /* ────────────────────────────────────────────────────────────────────────
   * Escrita
   * ──────────────────────────────────────────────────────────────────────── */

  async criar(body: TierBody): Promise<{ tier: { id: string } }> {
    const identidade = this.validarIdentidade(body, true);
    const numeros = this.validarNumeros(body, true);
    const alturas = this.alturasDeVideo(body.videoQualityHeights);

    const jaExiste = await this.prisma.partnerTier.findFirst({
      where: { slug: identidade.slug },
      select: { id: true },
    });
    if (jaExiste) {
      throw new ConflictException({ error: `Já existe um tier com o slug '${identidade.slug}'.` });
    }

    const data = {
      name: identidade.name!,
      slug: identidade.slug!,
      ...numeros,
      ...this.camposSoltos(body),
      ...(alturas !== undefined ? { videoQualityHeights: alturas } : {}),
    };

    const virarPadrao = body.isDefault === true;
    const tier = await this.gravarComPadrao(virarPadrao, null, (tx) =>
      tx.partnerTier.create({ data: { ...data, isDefault: virarPadrao } }),
    );

    return { tier: tier as { id: string } };
  }

  async atualizar(id: string, body: TierBody): Promise<{ tier: { id: string } }> {
    const atual = await this.prisma.partnerTier.findUnique({ where: { id }, select: { id: true } });
    if (!atual) throw new NotFoundException({ error: 'Tier não encontrado' });

    const identidade = this.validarIdentidade(body, false);
    const numeros = this.validarNumeros(body, false);
    const alturas = this.alturasDeVideo(body.videoQualityHeights);

    if (identidade.slug) {
      const conflito = await this.prisma.partnerTier.findFirst({
        where: { slug: identidade.slug, NOT: { id } },
        select: { id: true },
      });
      if (conflito) {
        throw new ConflictException({ error: `Já existe um tier com o slug '${identidade.slug}'.` });
      }
    }

    const data = {
      ...identidade,
      ...numeros,
      ...this.camposSoltos(body),
      ...(alturas !== undefined ? { videoQualityHeights: { set: alturas } } : {}),
      ...(body.isDefault !== undefined ? { isDefault: Boolean(body.isDefault) } : {}),
    };

    const virarPadrao = body.isDefault === true;
    const tier = await this.gravarComPadrao(virarPadrao, id, (tx) =>
      tx.partnerTier.update({ where: { id }, data }),
    );

    return { tier: tier as { id: string } };
  }

  /**
   * D72 — "só um tier é padrão" é invariante da TABELA, e ela agora tem um
   * caminho só.
   *
   * No legado o POST usava transação (BUG-118) e o PUT, três arquivos adiante,
   * fazia `updateMany` e `update` soltos — exatamente o que o comentário do POST
   * descreve como defeito. Falha entre as duas linhas e nenhum tier fica padrão,
   * que é o estado que quebra o onboarding de parceiros (A69).
   */
  private async gravarComPadrao<T>(
    virarPadrao: boolean,
    idPreservado: string | null,
    gravar: (tx: {
      partnerTier: {
        updateMany: (args: unknown) => Promise<unknown>;
        create: (args: unknown) => Promise<T>;
        update: (args: unknown) => Promise<T>;
      };
    }) => Promise<T>,
  ): Promise<T> {
    if (!virarPadrao) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return gravar(this.prisma as any);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.prisma.$transaction(async (tx: any) => {
      await tx.partnerTier.updateMany({
        where: idPreservado ? { NOT: { id: idPreservado } } : {},
        data: { isDefault: false },
      });
      return gravar(tx);
    });
  }

  async remover(id: string): Promise<{ ok: true }> {
    const [parceiros, historico] = await Promise.all([
      this.prisma.partnerAccount.count({ where: { tierId: id } }),
      this.prisma.partnerTierRequest.count({
        where: { OR: [{ toTierId: id }, { fromTierId: id }] },
      }),
    ]);

    if (parceiros > 0) {
      throw new BadRequestException({
        error: 'Não é possível excluir um tier que possui parceiros vinculados.',
      });
    }
    if (historico > 0) {
      throw new BadRequestException({
        error: `Este tier possui ${historico} registro(s) no histórico de trocas e não pode ser excluído. Desative-o em vez de excluir.`,
      });
    }

    await this.prisma.partnerTier.delete({ where: { id } });
    return { ok: true };
  }
}
