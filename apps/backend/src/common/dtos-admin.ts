import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Fatia 28 — DTOs restantes: admin + profile + realtime (SDD: Tampering).
 *
 * Mesma regra da fatia 27: o DTO valida a FORMA (tipos, presença, tetos);
 * regra de negócio continua no service. Faixas numéricas aqui repetem as do
 * service de propósito (dupla barreira na borda quente: financeiro e tiers
 * criam cobrança na Stripe).
 */

export class AffiliatesReservedBody {
  @ApiProperty({ description: 'Earnings reservados a resolver (máx. 200).' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  earningIds!: string[];

  @ApiProperty({ enum: ['release', 'cancel'] })
  @IsIn(['release', 'cancel'])
  action!: string;
}

export class AdminUsersActionBody {
  @ApiProperty({ enum: ['toggle_admin', 'grant_premium', 'revoke_premium', 'grant_test_b2b'] })
  @IsIn(['toggle_admin', 'grant_premium', 'revoke_premium', 'grant_test_b2b'])
  action!: string;

  @ApiPropertyOptional({ description: 'Obrigatório só para grant_test_b2b.' })
  @IsOptional()
  @IsString()
  offerId?: string;
}

export class AdminPartnerActionBody {
  @ApiProperty({ enum: ['approve', 'reject', 'suspend', 'update_financials'] })
  @IsIn(['approve', 'reject', 'suspend', 'update_financials'])
  action!: string;

  @ApiPropertyOptional({ description: 'Obrigatório para reject (service valida).' })
  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @ApiPropertyOptional({ description: 'Slug do tier (approve).' })
  @IsOptional()
  @IsString()
  partnerTier?: string;

  @ApiPropertyOptional({ description: 'Taxa de comissão 0–1 (approve).' })
  @IsOptional()
  commissionRate?: unknown;

  @ApiPropertyOptional({ description: 'Financeiros custom (update_financials).' })
  @IsOptional()
  financials?: unknown;
}

export class DistributionRule {
  @ApiPropertyOptional({ description: 'Rótulo da regra.' })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiProperty({ description: 'Percentual 0–1.' })
  @IsNumber()
  @Min(0)
  @Max(1)
  percentage!: number;
}

export class PlatformFinanceBody {
  @ApiPropertyOptional({ description: 'Taxa percentual Stripe, 0–0.1.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(0.1)
  stripePercentFee?: number;

  @ApiPropertyOptional({ description: 'Taxa fixa Stripe em centavos, 0–200.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(200)
  stripeFixedFeeInCents?: number;

  @ApiPropertyOptional({ description: 'Câmbio USD→BRL, 1–50.' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  usdToBrlRate?: number;

  @ApiPropertyOptional({ type: [DistributionRule], description: 'Regras (máx. 20; soma = 1 validada no service).' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => DistributionRule)
  distributionRules?: DistributionRule[];
}

export class ReportExpense {
  @ApiPropertyOptional({ description: 'Categoria.' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Descrição (teto 200 no service).' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Valor.' })
  @IsOptional()
  amount?: unknown;
}

export class ReportExpensesBody {
  @ApiPropertyOptional({ type: [ReportExpense], description: 'Despesas manuais (máx. 100).' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReportExpense)
  expenses?: ReportExpense[];
}

export class SaaSTierBody {
  @ApiProperty({ description: 'Nome do plano.' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ description: 'Preço mensal BRL, 0–9999.99.' })
  @IsNumber()
  @Min(0)
  @Max(9999.99)
  price!: number;

  @ApiProperty({ description: 'Descrição.' })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiPropertyOptional({ description: 'Price ID Stripe (cria produto se ausente).' })
  @IsOptional()
  @IsString()
  stripePriceId?: string;

  @ApiPropertyOptional({ description: 'Features.' })
  @IsOptional()
  @IsArray()
  features?: unknown;

  @ApiPropertyOptional({ description: 'Papel alvo.' })
  @IsOptional()
  @IsString()
  targetRole?: string;

  @ApiPropertyOptional({ description: 'Destaque na landing.' })
  @IsOptional()
  @IsBoolean()
  isPopular?: boolean;

  @ApiPropertyOptional({ description: 'Ativo.' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Máx. de alunos.' })
  @IsOptional()
  maxAthletes?: unknown;

  @ApiPropertyOptional({ description: 'Máx. de planos/mês.' })
  @IsOptional()
  maxPlansPerMonth?: unknown;

  @ApiPropertyOptional({ description: 'Alturas de vídeo permitidas.' })
  @IsOptional()
  videoQualityHeights?: unknown;
}

export class SaaSTierPatchBody {
  @ApiPropertyOptional({ description: 'Nome do plano.' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Preço mensal BRL, 0–9999.99.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(9999.99)
  price?: number;

  @ApiPropertyOptional({ description: 'Price ID Stripe.' })
  @IsOptional()
  @IsString()
  stripePriceId?: string;

  @ApiPropertyOptional({ description: 'Descrição.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Features.' })
  @IsOptional()
  @IsArray()
  features?: unknown;

  @ApiPropertyOptional({ description: 'Papel alvo.' })
  @IsOptional()
  @IsString()
  targetRole?: string;

  @ApiPropertyOptional({ description: 'Destaque na landing.' })
  @IsOptional()
  @IsBoolean()
  isPopular?: boolean;

  @ApiPropertyOptional({ description: 'Ativo.' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class StripeConnectRemoveBody {
  @ApiProperty({ description: 'ID da conta Connect.' })
  @IsString()
  @IsNotEmpty()
  accountId!: string;
}

export class VideoProcessorBody {
  @ApiProperty({ description: 'ID do exercício.' })
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiPropertyOptional({ description: 'Marca HLS como processado.' })
  @IsOptional()
  @IsBoolean()
  hlsProcessed?: boolean;

  @ApiPropertyOptional({ description: 'Chave do original no R2.' })
  @IsOptional()
  @IsString()
  originalVideoKey?: string;

  @ApiPropertyOptional({ description: 'Progresso 0–100.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  processingProgress?: number;
}

export class ProfileQuery {
  @ApiPropertyOptional({ description: 'Outro usuário (treinador/admin).' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Esporte.' })
  @IsOptional()
  @IsString()
  sport?: string;
}

export class ProfileSport {
  @ApiProperty({ description: 'ID do esporte.' })
  @IsString()
  @IsNotEmpty()
  sportId!: string;
}

export class ProfileUpsertBody {
  @ApiProperty({ type: [ProfileSport], description: 'Esportes (1–5).' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => ProfileSport)
  sports!: ProfileSport[];
}

export class PusherAuthBody {
  @ApiPropertyOptional({ description: 'ID do socket (snake_case).' })
  @IsOptional()
  @IsString()
  socket_id?: string;

  @ApiPropertyOptional({ description: 'ID do socket (camelCase).' })
  @IsOptional()
  @IsString()
  socketId?: string;

  @ApiPropertyOptional({ description: 'Canal (snake_case).' })
  @IsOptional()
  @IsString()
  channel_name?: string;

  @ApiPropertyOptional({ description: 'Canal (camelCase).' })
  @IsOptional()
  @IsString()
  channel?: string;
}

export class AuditLogsQuery {
  @ApiPropertyOptional({ description: 'Entidade.' })
  @IsOptional()
  @IsString()
  entity?: string;

  @ApiPropertyOptional({ description: 'Ação.' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ description: 'Autor.' })
  @IsOptional()
  @IsString()
  actorId?: string;

  @ApiPropertyOptional({ description: 'Busca.' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Página.' })
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional({ description: 'Tamanho (teto 100 no service).' })
  @IsOptional()
  @IsString()
  limit?: string;
}

export class AdminUsersQuery {
  @ApiPropertyOptional({ description: 'Página.' })
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional({ description: 'Tamanho (teto 100 no service).' })
  @IsOptional()
  @IsString()
  limit?: string;

  @ApiPropertyOptional({ description: 'Busca.' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filtro de papel.' })
  @IsOptional()
  @IsString()
  role?: string;
}
