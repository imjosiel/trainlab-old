import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

/**
 * Fatia 37 (D104) — DTO de vídeo. Valida FORMA; regra (quem pode ver a sala,
 * qual provider vale) fica no service. `joinUrl`/`roomName` nunca vêm do
 * corpo — são saída.
 */
const PROVEDORES = ['daily', 'jitsi', 'auto'] as const;

export class CreateVideoBody {
  @ApiPropertyOptional({
    enum: [...PROVEDORES],
    description: 'Provedor preferido. O servidor decide (fallback Jitsi sem chave Daily).',
  })
  @IsOptional()
  @IsIn([...PROVEDORES])
  provider?: string;
}
