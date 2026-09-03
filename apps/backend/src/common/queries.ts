import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * Fatia 30c (D106) — queries de listagem: tipar sem apertar. Tetos continuam
 * nos helpers (`parsePage`, `parseLimit`). Query errada nunca quebra.
 */
export class ListConversationsQuery {
  @ApiPropertyOptional({ description: 'Cursor (id da última conversa).' })
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class ListMessagesQuery {
  @ApiPropertyOptional({ description: 'Id da mensagem mais antiga carregada.' })
  @IsOptional()
  @IsString()
  before?: string;
}

export class ListarExerciciosQuery {
  @ApiPropertyOptional({ description: 'Categoria.' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Busca.' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Alias legado de q.' })
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

  @ApiPropertyOptional({ description: 'IDs separados por vírgula (máx. 50 no service).' })
  @IsOptional()
  @IsString()
  ids?: string;
}
