import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '@/prisma/prisma.service';
import { CreatePackageBody, UpdatePackageBody } from './dtos';

function validarCredits(value: unknown): number {
  const parsed = parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 500_000) {
    throw new BadRequestException({ error: 'credits deve ser entre 1 e 500.000.' });
  }
  return parsed;
}

function validarPrice(value: unknown): number {
  const parsed = parseFloat(String(value));
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 9999.99) {
    throw new BadRequestException({ error: 'price deve ser entre R$0,01 e R$9.999,99.' });
  }
  return parsed;
}

/** Fatia 17 — CRUD de pacotes de crédito e auditoria. `stripePriceId` é colado manualmente pelo admin, não cria produto na Stripe (D — sem porte de StripeService aqui, diferente de OffersService). */
@Injectable()
export class AdminCreditsService {
  constructor(private readonly prisma: PrismaService) {}

  async listarPacotes(): Promise<unknown> {
    const packages = await this.prisma.creditPackage.findMany({ orderBy: { credits: 'asc' } });
    return { packages };
  }

  async criarPacote(body: CreatePackageBody): Promise<unknown> {
    const { name, credits, price, stripePriceId } = body;

    if (!name || typeof name !== 'string' || name.length > 100) {
      throw new BadRequestException({ error: 'name é obrigatório (máx. 100 chars).' });
    }
    const parsedCredits = validarCredits(credits);
    const parsedPrice = validarPrice(price);

    const pkg = await this.prisma.creditPackage.create({
      data: { name, credits: parsedCredits, price: parsedPrice, stripePriceId: (stripePriceId as string) ?? null },
    });
    return { package: pkg };
  }

  async atualizarPacote(id: string, body: UpdatePackageBody): Promise<unknown> {
    const data: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.length > 100) {
        throw new BadRequestException({ error: 'name deve ter no máximo 100 caracteres.' });
      }
      data.name = body.name.substring(0, 100);
    }
    if (body.credits !== undefined) data.credits = validarCredits(body.credits);
    if (body.price !== undefined) data.price = validarPrice(body.price);
    if (body.stripePriceId !== undefined) data.stripePriceId = body.stripePriceId ? String(body.stripePriceId) : null;
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

    const pkg = await this.prisma.creditPackage.update({ where: { id }, data });
    return { package: pkg };
  }

  async apagarPacote(id: string): Promise<unknown> {
    await this.prisma.creditPackage.delete({ where: { id } });
    return { success: true };
  }

  async listarTransacoes(): Promise<unknown> {
    const transactions = await this.prisma.creditTransaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        type: true,
        bucket: true,
        amount: true,
        balanceAfter: true,
        feature: true,
        description: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    });
    return { transactions };
  }
}
