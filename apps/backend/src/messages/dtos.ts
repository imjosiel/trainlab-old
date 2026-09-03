import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Fatia 30c (D104) — DTOs de messages. Regra de posse fica no service.
 */
export class CreateConversationBody {
  @ApiProperty({ description: 'Profissional.' })
  @IsString()
  @IsNotEmpty()
  trainerId!: string;

  @ApiProperty({ description: 'Aluno.' })
  @IsString()
  @IsNotEmpty()
  studentId!: string;
}

export class SendMessageBody {
  @ApiProperty({ description: 'Conteúdo 1–5000 (service mede o trimado — A54).' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content!: string;
}
