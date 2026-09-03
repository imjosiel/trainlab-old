import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Fatia 30b (D104) — DTOs de students (só o create; o profile update já tem
 * DTO na fatia 28). Regra de posse/limite fica no service.
 */
export class CreateStudentBody {
  @ApiProperty({ description: 'Nome (1–100).' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ description: 'Email (vincula user + convite).' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Slug do esporte.' })
  @IsOptional()
  @IsString()
  sport?: string;

  @ApiPropertyOptional({ description: 'ID do esporte.' })
  @IsOptional()
  @IsString()
  sportId?: string;

  @ApiPropertyOptional({ description: 'Posição (service corta em 50).' })
  @IsOptional()
  @IsString()
  position?: string;
}

/**
 * Fatia 36 (D122) — DTOs de invites + notes. Services mantêm EMAIL_REGEX,
 * teto 254, cooldown e sanitização (dupla barreira).
 */
export class InviteEmailBody {
  @ApiProperty({ description: 'Email do convidado.' })
  @IsEmail()
  email!: string;
}

export class InviteTokenBody {
  @ApiProperty({ description: 'Token do convite.' })
  @IsString()
  @IsNotEmpty()
  token!: string;
}

export class CreateNoteBody {
  @ApiProperty({ description: 'Conteúdo 1–2000 (service sanitiza).' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content!: string;
}
