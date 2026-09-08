import { Controller, Headers, Post, RawBodyRequest, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';

import { Public } from '@/auth/public.decorator';
import { B2BWebhookService } from './b2b-webhook.service';

/**
 * Endpoint SEPARADO do webhook B2C/créditos/tier do monolito — Josiel decidiu
 * migrar só os handlers B2B nesta fatia (ver spec, "Escopo"). O Stripe aceita
 * dois endpoints simultâneos, cada um com seu próprio segredo de assinatura
 * (`STRIPE_WEBHOOK_SECRET_B2B`).
 *
 * Excluído do Swagger: não é uma rota que humano chama pela doc.
 */
@ApiExcludeController()
@Controller('stripe/webhook-b2b')
export class B2BWebhookController {
  constructor(private readonly webhook: B2BWebhookService) {}

  @Public()
  @SkipThrottle()
  @Post()
  processar(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') assinatura?: string) {
    const corpo = req.rawBody?.toString('utf8') ?? '';
    return this.webhook.processarWebhook(corpo, assinatura ?? null);
  }
}
