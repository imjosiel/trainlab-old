import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Fatia 30c (D104) — DTOs de sports.
 *
 * Limites de slug divergem entre criar (50) e editar (30) no legado (A4) —
 * portado fielmente; unificar é decisão de produto.
 */

const SLUG = /^[a-z0-9-]+$/;

export class CreateSportInput {
  @ApiProperty({ description: 'Nome.' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ description: 'Slug minúsculo com hífens (máx. 50 no POST).' })
  @IsString()
  @Matches(SLUG, { message: 'Slug inválido. Use letras minúsculas, números e hífens.' })
  @MaxLength(50)
  slug!: string;

  @ApiPropertyOptional({ description: 'Posições.' })
  @IsOptional()
  positions?: unknown;
}

export class UpdateSportInput {
  @ApiPropertyOptional({ description: 'Nome.' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Slug (máx. 30 no PATCH — A4).' })
  @IsOptional()
  @IsString()
  @Matches(SLUG, { message: 'Slug inválido. Use letras minúsculas, números e hífens.' })
  @MaxLength(30)
  slug?: string;

  @ApiPropertyOptional({ description: 'Ativo.' })
  @IsOptional()
  isActive?: unknown;

  @ApiPropertyOptional({ description: 'Posições.' })
  @IsOptional()
  positions?: unknown;
}
