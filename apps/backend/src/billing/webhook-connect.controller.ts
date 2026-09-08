import { Controller, Headers, Post, RawBodyRequest, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';

import { Public } from '@/auth/public.decorator';
import { WebhookConnectService } from './webhook-connect.service';

/**
 * Terceiro endpoint dedicado, ao lado de `webhook-b2b` e `webhook-credits`
 * (fatia 25 — ver spec, "O recorte"): tier pago do parceiro, sync de conta
 * Connect (parceiro e afiliado), reembolso. Segredo próprio
 * (`STRIPE_WEBHOOK_SECRET_CONNECT`).
 *
 * Excluído do Swagger: não é uma rota que humano chama pela doc.
 */
@ApiExcludeController()
@Controller('stripe/webhook-connect')
export class WebhookConnectController {
  constructor(private readonly webhook: WebhookConnectService) {}

  @Public()
  @SkipThrottle()
  @Post()
  processar(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') assinatura?: string) {
    const corpo = req.rawBody?.toString('utf8') ?? '';
    return this.webhook.processarWebhook(corpo, assinatura ?? null);
  }
}
