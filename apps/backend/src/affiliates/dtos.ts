import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

/**
 * Fatia 30d (D104) — DTOs de affiliates. Lista de components é a do
 * COMPONENT_MAP do service (sem 'payments', diferente do parceiro).
 */

const COMPONENTS_AFILIADO = ['account_onboarding', 'account_management', 'payouts'] as const;

export class CriarSessaoDeOnboardingBody {
  @ApiPropertyOptional({ enum: [...COMPONENTS_AFILIADO] })
  @IsOptional()
  @IsIn([...COMPONENTS_AFILIADO])
  components?: string;
}

export class ListarGanhosQuery {
  @ApiPropertyOptional({ description: 'Página.' })
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional({ description: 'Tamanho.' })
  @IsOptional()
  @IsString()
  limit?: string;

  @ApiPropertyOptional({ description: 'Início ISO.' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Fim ISO.' })
  @IsOptional()
  @IsString()
  endDate?: string;
}
