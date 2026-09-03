import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Fatia 30c (D104) — DTOs de exercises. Categoria/dificuldade têm lista
 * fechada (service normaliza capitalização antes de comparar).
 */

const VALID_CATEGORIES = [
  'Técnico',
  'Físico',
  'Tático',
  'Mental',
  'Aquecimento',
  'Recuperação',
  'Finalização',
  'Goleiro',
  'Outro',
] as const;

const VALID_DIFFICULTIES = ['Iniciante', 'Intermediário', 'Avançado', 'Profissional'] as const;

export class CriarExercicioBody {
  @ApiProperty({ description: 'Nome (máx. 100).' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ description: 'Descrição (teto 50.000 e não-vazia no service).' })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiProperty({ enum: [...VALID_CATEGORIES] })
  @IsString()
  @IsIn([...VALID_CATEGORIES])
  category!: string;

  @ApiProperty({ enum: [...VALID_DIFFICULTIES] })
  @IsString()
  @IsIn([...VALID_DIFFICULTIES])
  difficulty!: string;

  @ApiPropertyOptional({ description: 'URL do vídeo (/api/videos/... = R2).' })
  @IsOptional()
  @IsString()
  videoUrl?: string;

  @ApiPropertyOptional({ description: 'ID público do vídeo.' })
  @IsOptional()
  @IsString()
  videoPublicId?: string;

  @ApiPropertyOptional({ description: 'HLS processado.' })
  @IsOptional()
  hlsProcessed?: unknown;

  @ApiPropertyOptional({ description: 'Chave do original no R2.' })
  @IsOptional()
  @IsString()
  originalVideoKey?: string;
}

export class AtualizarExercicioBody {
  @ApiPropertyOptional({ description: 'Nome (máx. 100 no service).' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Descrição.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: [...VALID_CATEGORIES] })
  @IsOptional()
  @IsString()
  @IsIn([...VALID_CATEGORIES])
  category?: string;

  @ApiPropertyOptional({ enum: [...VALID_DIFFICULTIES] })
  @IsOptional()
  @IsString()
  @IsIn([...VALID_DIFFICULTIES])
  difficulty?: string;

  @ApiPropertyOptional({ description: 'URL do vídeo.' })
  @IsOptional()
  @IsString()
  videoUrl?: string;

  @ApiPropertyOptional({ description: 'ID público do vídeo.' })
  @IsOptional()
  @IsString()
  videoPublicId?: string;
}
