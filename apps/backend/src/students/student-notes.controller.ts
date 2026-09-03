import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { CreateNoteBody } from './dtos';
import { StudentNotesService } from './student-notes.service';

@ApiTags('student-notes')
@ApiBearerAuth()
@Controller('students/:studentId/notes')
export class StudentNotesController {
  constructor(private readonly notes: StudentNotesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista anotações do aluno (RAG).' })
  listar(@CurrentUser() user: SessionPayload, @Param('studentId') studentId: string) {
    return this.notes.listar(user.id, studentId);
  }

  @Post()
  @ApiOperation({ summary: 'Cria anotação para o aluno.' })
  criar(@CurrentUser() user: SessionPayload, @Param('studentId') studentId: string, @Body() body: CreateNoteBody) {
    return this.notes.criar(user.id, studentId, body.content);
  }

  @Delete(':noteId')
  @ApiOperation({ summary: 'Remove anotação.' })
  remover(@CurrentUser() user: SessionPayload, @Param('studentId') studentId: string, @Param('noteId') noteId: string) {
    return this.notes.remover(user.id, studentId, noteId);
  }
}
