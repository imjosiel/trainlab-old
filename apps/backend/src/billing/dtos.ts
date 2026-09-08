import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Fatia 30a (D104) — DTOs do billing. Valida FORMA; regra que precisa de
 * banco (tier existe? oferta ativa? aluno é meu?) fica no service (D104).
 * Mensagens específicas do service vencem (D105).
 */

const MAX_PRICE = 9999.99;

export class CheckoutB2BBody {
  @ApiProperty({ description: 'ID da oferta.' })
  @IsString()
  @IsNotEmpty()
  offerId!: string;

  @ApiPropertyOptional({ description: 'Email do aluno (guest).' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Nome do aluno (guest, máx. 100).' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: 'URL de retorno (precisa ser do próprio app — service valida).' })
  @IsOptional()
  @IsString()
  returnUrl?: string;
}

export class CheckoutTierBody {
  @ApiProperty({ description: 'Tier de destino.' })
  @IsString()
  @IsNotEmpty()
  toTierId!: string;

  @ApiPropertyOptional({ description: 'URL de retorno.' })
  @IsOptional()
  @IsString()
  returnUrl?: string;

  @ApiPropertyOptional({ enum: ['brl', 'usd'], default: 'brl' })
  @IsOptional()
  @IsIn(['brl', 'usd'])
  currency?: string;
}

export class PortalBody {
  @ApiPropertyOptional({ description: 'URL de retorno.' })
  @IsOptional()
  @IsString()
  returnUrl?: string;
}

export class CheckoutBody {
  @ApiPropertyOptional({ description: 'Email (guest).' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Usa trial da oferta.' })
  @IsOptional()
  @IsBoolean()
  isTrial?: boolean;
}

export class CancelBody {
  @ApiPropertyOptional({ description: 'Troca para outra oferta em vez de cancelar.' })
  @IsOptional()
  @IsString()
  switchToOfferId?: string;
}

export class ReactivateBody {
  @ApiPropertyOptional({ description: 'Limpa downgrade agendado.' })
  @IsOptional()
  @IsBoolean()
  clearPending?: boolean;
}

export class CreateOfferBody {
  @ApiProperty({ description: 'Nome (máx. 100).' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ description: 'Descrição (máx. 500).' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ description: 'Preço mensal BRL (mínimo do tier validado no service).' })
  @IsNumber()
  @Min(0)
  @Max(MAX_PRICE)
  price!: number;

  @ApiPropertyOptional({ description: 'Taxa de serviço BRL (tier precisa permitir — service valida).' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(MAX_PRICE)
  hourlyRate?: number;

  @ApiPropertyOptional({ description: 'Rótulo da taxa (máx. 60).' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  hourlyLabel?: string;
}

export class UpdateOfferBody {
  @ApiPropertyOptional({ description: 'Nome (máx. 100).' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: 'Descrição (máx. 500).' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Preço mensal BRL.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(MAX_PRICE)
  price?: number;

  @ApiPropertyOptional({ description: 'Taxa de serviço BRL.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(MAX_PRICE)
  hourlyRate?: number;

  @ApiPropertyOptional({ description: 'Rótulo da taxa (máx. 60).' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  hourlyLabel?: string;

  @ApiPropertyOptional({ description: 'Ativa/desativa.' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class GrantOrRevokeBody {
  @ApiProperty({ enum: ['grant', 'revoke'], description: 'Ação do admin.' })
  @IsIn(['grant', 'revoke'])
  action!: string;

  @ApiPropertyOptional({ description: 'Oferta (conceder).' })
  @IsOptional()
  @IsString()
  offerId?: string;

  @ApiPropertyOptional({ description: 'Assinatura (revogar).' })
  @IsOptional()
  @IsString()
  subscriptionId?: string;
}
