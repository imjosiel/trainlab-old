import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

/**
 * Fatia 36 — DTO do link mágico de agendamento. Ação fora da lista vira 400
 * no pipe em vez de cair no `else` do service.
 */
export class ConfirmAppointmentBody {
  @ApiPropertyOptional({ enum: ['confirm', 'cancel'] })
  @IsOptional()
  @IsIn(['confirm', 'cancel'])
  action?: string;
}
