import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ThrottlerGuard,
  ThrottlerLimitDetail,
  ThrottlerModuleOptions,
  ThrottlerStorage,
  InjectThrottlerOptions,
  InjectThrottlerStorage,
} from '@nestjs/throttler';

/** Mensagem única de 429 — PT-BR, segue o contrato `{ error }` no filtro. */
export const MENSAGEM_LIMITE =
  'Muitas requisições. Tente novamente em alguns instantes.';

/**
 * Fatia 27 (SDD: Spoofing/Elevation + Repudiation).
 *
 * Tracker por identidade, não por IP: com sessão, `request.user.id` (IP é
 * compartilhável — NAT, rede corporativa — e permite consumir a cota alheia
 * ou fugir da própria). Sem sessão (guest: checkout B2B, link mágico), o IP
 * é o único tracker possível.
 *
 * Ordem dos guards (D11 estendido): auth (401) → roles (403) → throttle
 * (429). O throttle precisa rodar DEPOIS de saber quem é, mas ANTES do
 * handler.
 */
@Injectable()
export class TrainLabThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
  ) {
    super(options, storage, reflector);
  }

  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req['user'] as { id?: unknown } | undefined;
    if (user && typeof user.id === 'string' && user.id.length > 0) {
      return user.id;
    }
    const forwarded = req['headers'] as { 'x-forwarded-for'?: unknown } | undefined;
    const xff = forwarded?.['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length > 0) {
      return xff.split(',')[0].trim();
    }
    const ip = req['ip'];
    return typeof ip === 'string' && ip.length > 0 ? ip : 'desconhecido';
  }

  protected async getErrorMessage(
    _context: ExecutionContext,
    _throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<string> {
    return MENSAGEM_LIMITE;
  }
}
