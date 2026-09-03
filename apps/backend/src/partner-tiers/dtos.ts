import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Fatia 30d (D104) — DTOs de tier-requests. Eram tipos inline
 * `{ action?: unknown; note?: unknown }` no controller.
 */
export class DecidirTierRequestBody {
  @ApiProperty({ enum: ['approve', 'reject'] })
  @IsIn(['approve', 'reject'])
  action!: string;

  @ApiPropertyOptional({ description: 'Nota do admin.' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class ForcarTierBody {
  @ApiProperty({ description: 'Tier de destino.' })
  @IsString()
  @IsNotEmpty()
  toTierId!: string;

  @ApiPropertyOptional({ description: 'Motivo (vai para a auditoria).' })
  @IsOptional()
  @IsString()
  reason?: string;
}
