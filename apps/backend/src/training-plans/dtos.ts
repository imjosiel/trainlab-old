import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Fatia 30b (D104) — DTOs de training-plans + sessions. Valida FORMA;
 * posse, gate B2B e state-machine ficam nos services.
 */

const PLAN_STATUS = ['PENDING', 'APPROVED', 'REJECTED', 'DELIVERED', 'COMPLETED', 'ARCHIVED'] as const;

export class ListPlansQuery {
  @ApiPropertyOptional({ description: 'Aluno B2B.' })
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiPropertyOptional({ description: 'Atleta B2C.' })
  @IsOptional()
  @IsString()
  athleteId?: string;

  @ApiPropertyOptional({ description: 'Filtro de status (service ignora inválido/atleta restrito).' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Busca por título (service corta em 100).' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Página.' })
  @IsOptional()
  @IsString()
  page?: string;
}

export class UpdatePlanBody {
  @ApiPropertyOptional({ enum: [...PLAN_STATUS], description: 'Novo status (transição validada no service — D100).' })
  @IsOptional()
  @IsIn([...PLAN_STATUS])
  status?: string;

  @ApiPropertyOptional({ description: 'Plano final (teto 50.000 no service).' })
  @IsOptional()
  @IsString()
  finalPlan?: string;

  @ApiPropertyOptional({ description: 'Notas do treinador (teto 5.000 no service).' })
  @IsOptional()
  @IsString()
  trainerNotes?: string;
}

export class CreatePlanBody {
  @ApiPropertyOptional({ description: 'Aluno B2B.' })
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiPropertyOptional({ description: 'Atleta B2C.' })
  @IsOptional()
  @IsString()
  athleteId?: string;

  @ApiPropertyOptional({ description: 'Perfil esportivo.' })
  @IsOptional()
  @IsString()
  profileId?: string;

  @ApiPropertyOptional({ description: 'Duração em dias (service clamp 1–365).' })
  @IsOptional()
  duration?: unknown;

  @ApiPropertyOptional({ description: 'Pula IA.' })
  @IsOptional()
  @IsBoolean()
  isManual?: boolean;
}

export class UpdateSessionBody {
  @ApiPropertyOptional({ description: 'Marca como concluída.' })
  @IsOptional()
  @IsBoolean()
  completed?: boolean;

  @ApiPropertyOptional({ description: 'Feedback (teto 1.000 no service).' })
  @IsOptional()
  @IsString()
  athleteFeedback?: string;

  @ApiPropertyOptional({ description: 'Nota 1–5.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  athleteFeedbackRating?: number;

  @ApiPropertyOptional({ description: 'Exercícios (string ou JSON — service normaliza).' })
  @IsOptional()
  exercises?: unknown;
}

export class EditSessionBody {
  @ApiPropertyOptional({ description: 'Título.' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Dia.' })
  @IsOptional()
  day?: unknown;

  @ApiPropertyOptional({ description: 'Duração.' })
  @IsOptional()
  duration?: unknown;

  @ApiPropertyOptional({ description: 'Descrição.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Exercícios.' })
  @IsOptional()
  exercises?: unknown;
}

export class CreateSessionBody {
  @ApiPropertyOptional({ description: 'Título.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Descrição.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Exercícios.' })
  @IsOptional()
  exercises?: unknown;

  @ApiPropertyOptional({ description: 'Dia.' })
  @IsOptional()
  day?: unknown;

  @ApiPropertyOptional({ description: 'Duração.' })
  @IsOptional()
  duration?: unknown;
}
