import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { SessionPayload } from '@/auth/session-payload';

@Injectable()
export class StudentNotesService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertOwnership(trainerId: string, studentId: string) {
    const student: any = await this.prisma.student.findUnique({ where: { id: studentId }, select: { trainerId: true } });
    if (!student) throw new NotFoundException({ error: 'Aluno não encontrado.' });
    if (student.trainerId !== trainerId) throw new ForbiddenException({ error: 'Você não tem permissão para gerenciar este aluno.' });
    return student;
  }

  async listar(trainerId: string, studentId: string): Promise<unknown> {
    await this.assertOwnership(trainerId, studentId);
    const notes = await this.prisma.studentNote.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, content: true, createdAt: true, updatedAt: true, trainerId: true },
    });
    return { notes };
  }

  async criar(trainerId: string, studentId: string, content: string): Promise<unknown> {
    await this.assertOwnership(trainerId, studentId);
    const sanitized = String(content ?? '').trim().replace(/\bignore\b.*\binstructi/gi, '[removido]').slice(0, 2000);
    if (!sanitized) throw new BadRequestException({ error: 'Conteúdo da anotação não pode estar vazio.' });
    if (sanitized.length > 2000) throw new BadRequestException({ error: 'Anotação deve ter no máximo 2000 caracteres.' });
    const note = await this.prisma.studentNote.create({ data: { studentId, trainerId, content: sanitized } });
    return { note, message: 'Anotação criada com sucesso' };
  }

  async remover(trainerId: string, studentId: string, noteId: string): Promise<unknown> {
    await this.assertOwnership(trainerId, studentId);
    const note: any = await this.prisma.studentNote.findUnique({ where: { id: noteId } });
    if (!note || note.studentId !== studentId) throw new NotFoundException({ error: 'Anotação não encontrada.' });
    if (note.trainerId !== trainerId) throw new ForbiddenException({ error: 'Sem permissão para remover esta anotação.' });
    await this.prisma.studentNote.delete({ where: { id: noteId } });
    return { message: 'Anotação removida com sucesso' };
  }
}
