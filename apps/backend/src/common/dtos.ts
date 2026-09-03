import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/**
 * Fatia 27 — DTOs do núcleo quente (SDD: Tampering).
 *
 * Seis corpos que hoje são `body: any` e chegam crus aos services. Cada DTO
 * valida só a FORMA (tipos, presença, tetos); regra de negócio continua no
 * service. `whitelist: true` no pipe global descarta o resto sem quebrar
 * clientes que mandam campo a mais (ex. PATCH parcial do perfil, D30).
 */

const PAPEIS_ONBOARDING = [
  'PROFESSIONAL',
  'INDIVIDUAL',
  'CLIENT',
  'PARTNER_B2B',
  'AFFILIATE',
] as const;

export class OnboardingBody {
  @ApiProperty({ enum: [...PAPEIS_ONBOARDING], description: 'Papel de produto escolhido.' })
  @IsString()
  @IsIn([...PAPEIS_ONBOARDING])
  role!: string;

  @ApiPropertyOptional({ description: 'Telefone (só PROFESSIONAL/PARTNER_B2B usam).' })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class PresignFile {
  @ApiProperty({ description: 'Identificador do arquivo no batch.' })
  @IsString()
  @IsNotEmpty()
  field!: string;

  @ApiProperty({ description: 'Nome do arquivo.' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: 'MIME type.' })
  @IsOptional()
  @IsString()
  type?: string;
}

export class UploadPresignBody {
  @ApiProperty({ type: [PresignFile], description: 'Arquivos a presinar (máx. 20).' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PresignFile)
  files!: PresignFile[];
}

export class TierRequestBody {
  @ApiProperty({ description: 'Tier de destino.' })
  @IsString()
  @IsNotEmpty()
  toTierId!: string;
}

export class SaasCheckoutBody {
  @ApiProperty({ description: 'ID do tier SaaS.' })
  @IsString()
  @IsNotEmpty()
  tierId!: string;

  @ApiProperty({ description: 'URL de origem (precisa ser do próprio app).' })
  @IsString()
  @IsNotEmpty()
  originUrl!: string;

  @ApiPropertyOptional({ enum: ['brl', 'usd'], default: 'brl' })
  @IsOptional()
  @IsIn(['brl', 'usd'])
  currency?: string;
}

export class AdminSettingsBody {
  @ApiPropertyOptional({ description: 'Módulo atleta ligado.' })
  @IsOptional()
  @IsBoolean()
  moduleAthleteEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Módulo treinador ligado.' })
  @IsOptional()
  @IsBoolean()
  moduleCoachEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Módulo parceiro B2B ligado.' })
  @IsOptional()
  @IsBoolean()
  modulePartnerB2BEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Módulo afiliado ligado.' })
  @IsOptional()
  @IsBoolean()
  moduleAffiliateEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Aprovação automática de parceiros.' })
  @IsOptional()
  @IsBoolean()
  autoApprovePartners?: boolean;

  @ApiPropertyOptional({ description: 'Aprovação automática de troca de tier.' })
  @IsOptional()
  @IsBoolean()
  autoApproveTierChange?: boolean;

  @ApiPropertyOptional({ description: 'Sistema de créditos ligado.' })
  @IsOptional()
  @IsBoolean()
  enableCreditSystem?: boolean;

  @ApiPropertyOptional({ enum: ['groq', 'gemini'], description: 'Provedor de IA.' })
  @IsOptional()
  @IsIn(['groq', 'gemini'])
  aiProvider?: string;
}

export class PartnerSettingsBody {
  @ApiProperty({ description: 'Modo de teste da conta.' })
  @IsBoolean()
  allowTestMode!: boolean;
}
