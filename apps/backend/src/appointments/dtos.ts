import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Fatia 30b (D104) — DTOs de appointments. Valida FORMA; regra que precisa
 * de banco (aluno é meu? data válida? conflito de horário?) fica no service.
 */

const STATUS_VALIDOS = ['PENDING', 'CONFIRMED', 'CANCELED', 'COMPLETED'] as const;
const ACOES_LINK = ['generate-link', 'revoke-link'] as const;

export class CreateAppointmentBody {
  @ApiProperty({ description: 'Título (máx. 150).' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title!: string;

  @ApiProperty({ description: 'Data/hora ISO 8601.' })
  @IsDateString({}, { message: 'scheduledAt inválido. Use formato ISO 8601.' })
  scheduledAt!: string;

  @ApiPropertyOptional({ description: 'Aluno B2B (um dos dois participantes é obrigatório — service valida).' })
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiPropertyOptional({ description: 'Atleta B2C.' })
  @IsOptional()
  @IsString()
  athleteId?: string;

  @ApiPropertyOptional({ description: 'Duração em minutos.' })
  @IsOptional()
  durationMinutes?: unknown;

  @ApiPropertyOptional({ description: 'Local.' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ description: 'Descrição.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Plano vinculado.' })
  @IsOptional()
  @IsString()
  trainingPlanId?: string;

  @ApiPropertyOptional({ description: 'Notas do treinador.' })
  @IsOptional()
  @IsString()
  trainerNotes?: string;

  @ApiPropertyOptional({ description: 'Cria evento Google Meet.' })
  @IsOptional()
  @IsBoolean()
  createMeet?: boolean;
}

export class UpdateAppointmentBody {
  @ApiPropertyOptional({ description: 'Título (máx. 150).' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @ApiPropertyOptional({ description: 'Data/hora ISO 8601.' })
  @IsOptional()
  @IsDateString({}, { message: 'scheduledAt inválido. Use formato ISO 8601.' })
  scheduledAt?: string;

  @ApiPropertyOptional({ description: 'Duração em minutos.' })
  @IsOptional()
  durationMinutes?: unknown;

  @ApiPropertyOptional({ description: 'Local.' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ description: 'Descrição.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Notas do treinador.' })
  @IsOptional()
  @IsString()
  trainerNotes?: string;

  @ApiPropertyOptional({ enum: [...STATUS_VALIDOS] })
  @IsOptional()
  @IsIn([...STATUS_VALIDOS])
  status?: string;

  @ApiPropertyOptional({ description: 'Ação de link mágico.' })
  @IsOptional()
  @IsIn([...ACOES_LINK, 'confirm', 'cancel'])
  action?: string;

  @ApiPropertyOptional({ description: 'Motivo do cancelamento.' })
  @IsOptional()
  @IsString()
  cancelReason?: string;

  @ApiPropertyOptional({ description: 'Aluno B2B.' })
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiPropertyOptional({ description: 'Atleta B2C.' })
  @IsOptional()
  @IsString()
  athleteId?: string;

  @ApiPropertyOptional({ description: 'Plano vinculado.' })
  @IsOptional()
  @IsString()
  trainingPlanId?: string;
}

export class CreateBlockedSlotBody {
  @ApiPropertyOptional({ description: 'Rótulo.' })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiProperty({ description: 'Início ISO 8601 (service valida a data — A64).' })
  @IsDateString({}, { message: 'startTime inválido. Use formato ISO 8601.' })
  startTime!: string;

  @ApiProperty({ description: 'Fim ISO 8601 (service valida ordem).' })
  @IsDateString({}, { message: 'endTime inválido. Use formato ISO 8601.' })
  endTime!: string;

  @ApiPropertyOptional({ description: 'Recorrente.' })
  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;
}

export class UpdateScheduleConfigBody {
  @ApiPropertyOptional({ description: 'Hora de início 0–23 (inteiro — A58).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  workStartHour?: number;

  @ApiPropertyOptional({ description: 'Hora de fim 0–23 (inteiro — A58).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  workEndHour?: number;

  @ApiPropertyOptional({ description: 'Dias 0–6.' })
  @IsOptional()
  @IsArray()
  workDays?: unknown;
}
