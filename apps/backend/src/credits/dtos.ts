import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Fatia 30d (D104) — DTOs de credits-admin. Faixas portadas dos validadores
 * do service (`validarCredits`, `validarPrice`, `MAX_GRANT`).
 */

const MAX_GRANT = 100_000;

export class GrantBody {
  @ApiProperty({ description: 'Usuário destino.' })
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({ description: 'Quantidade 1–100.000.' })
  @IsInt()
  @Min(1)
  @Max(MAX_GRANT)
  amount!: number;

  @ApiPropertyOptional({ description: 'Descrição.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ['plan', 'purchased'], default: 'plan' })
  @IsOptional()
  @IsIn(['plan', 'purchased'])
  bucket?: string;
}

export class CreatePackageBody {
  @ApiProperty({ description: 'Nome (máx. 100).' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ description: 'Créditos 1–500.000.' })
  @IsInt()
  @Min(1)
  @Max(500_000)
  credits!: number;

  @ApiProperty({ description: 'Preço BRL 0,01–9.999,99.' })
  @IsNumber()
  @Min(0.01)
  @Max(9999.99)
  price!: number;

  @ApiPropertyOptional({ description: 'Price ID Stripe (colado manualmente).' })
  @IsOptional()
  @IsString()
  stripePriceId?: string;
}

export class UpdatePackageBody {
  @ApiPropertyOptional({ description: 'Nome (máx. 100).' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: 'Créditos 1–500.000.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500_000)
  credits?: number;

  @ApiPropertyOptional({ description: 'Preço BRL 0,01–9.999,99.' })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(9999.99)
  price?: number;

  @ApiPropertyOptional({ description: 'Price ID Stripe.' })
  @IsOptional()
  @IsString()
  stripePriceId?: string;

  @ApiPropertyOptional({ description: 'Ativo.' })
  @IsOptional()
  isActive?: unknown;
}
