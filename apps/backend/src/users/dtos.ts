import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

/**
 * Fatia 36 (D121) — DTO do PATCH /users/profile.
 *
 * Allowlist de ENTRADA com os seis campos (D31/D32). `role` sem `IsIn` de
 * propósito: papel fora da lista responde 200 sem alterar nada (D30) — um
 * `IsIn` aqui transformaria em 400 e quebraria o contrato observado.
 */
export class UpdateOwnProfileBody {
  @ApiPropertyOptional({ description: 'Username 3–20 (service valida formato e unicidade).' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ description: 'Bio.' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ description: 'Perfil público.' })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ description: 'Nome.' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Papel de produto (service ignora fora da lista — D30).' })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ description: 'Telefone (service normaliza).' })
  @IsOptional()
  @IsString()
  phone?: string;
}
