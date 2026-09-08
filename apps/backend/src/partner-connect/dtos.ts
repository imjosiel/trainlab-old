import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

/**
 * Fatia 30d (D104) — DTOs de partner-connect. `motivation` tem piso de 20
 * chars só quando auto-approve está desligado (service decide) — aqui só
 * forma. `components` tem lista fechada (COMPONENT_MAP do service).
 */

const COMPONENTS_PARCEIRO = [
  'account_onboarding',
  'account_management',
  'payments',
  'payouts',
] as const;

export class CandidatarBody {
  @ApiPropertyOptional({ description: 'Motivação (mín. 20 chars se auto-approve desligado — service valida).' })
  @IsOptional()
  @IsString()
  motivation?: string;
}

export class CriarSessaoDeOnboardingBody {
  @ApiPropertyOptional({ enum: [...COMPONENTS_PARCEIRO] })
  @IsOptional()
  @IsIn([...COMPONENTS_PARCEIRO])
  components?: string;
}
