import { Controller, Headers, Post, RawBodyRequest, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';

import { Public } from '@/auth/public.decorator';
import { CreditsWebhookService } from './credits-webhook.service';

/**
 * Endpoint SEPARADO do webhook antigo (mesmo formato da fatia 14/15 pro
 * B2B) — segredo de assinatura próprio (`STRIPE_WEBHOOK_SECRET_CREDITS`).
 *
 * Excluído do Swagger: não é uma rota que humano chama pela doc.
 */
@ApiExcludeController()
@Controller('stripe/webhook-credits')
export class CreditsWebhookController {
  constructor(private readonly webhook: CreditsWebhookService) {}

  @Public()
  @SkipThrottle()
  @Post()
  processar(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') assinatura?: string) {
    const corpo = req.rawBody?.toString('utf8') ?? '';
    return this.webhook.processarWebhook(corpo, assinatura ?? null);
  }
}
