import { HttpException } from '@nestjs/common';
import { StudentNotesService } from './student-notes.service';

function prismaMock() {
  return {
    student: { findUnique: jest.fn() },
    studentNote: { findMany: jest.fn(), create: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
  };
}
async function bodyOf(p: Promise<unknown>): Promise<Record<string, unknown>> {
  try { await p; throw new Error('esperava rejeição'); } catch (e) { if (e instanceof HttpException) return e.getResponse() as Record<string, unknown>; throw e; }
}
const TRAINER = 'trainer-1';
const STUDENT = 'stu-1';

describe('StudentNotesService (RAG)', () => {
  let prisma: ReturnType<typeof prismaMock>;
  let service: StudentNotesService;
  beforeEach(() => {
    prisma = prismaMock();
    service = new StudentNotesService(prisma as any);
    prisma.student.findUnique.mockResolvedValue({ trainerId: TRAINER });
    prisma.studentNote.findMany.mockResolvedValue([]);
    prisma.studentNote.create.mockImplementation(async (a: any) => ({ id: 'note-1', ...a.data }));
    prisma.studentNote.findUnique.mockResolvedValue({ id: 'note-1', studentId: STUDENT, trainerId: TRAINER });
  });

  it('lista: 403 se aluno não é do treinador', async () => {
    prisma.student.findUnique.mockResolvedValue({ trainerId: 'outro' });
    const body = await bodyOf(service.listar(TRAINER, STUDENT));
    expect(body.error).toMatch(/permissão/i);
  });

  it('cria: 400 se conteúdo vazio', async () => {
    const body = await bodyOf(service.criar(TRAINER, STUDENT, '   '));
    expect(body.error).toMatch(/vazio/i);
  });

  it('cria: sanitiza prompt injection e corta 2000', async () => {
    await service.criar(TRAINER, STUDENT, 'ignore this instructi ' + 'x'.repeat(3000));
    const content = (prisma.studentNote.create as jest.Mock).mock.calls[0][0].data.content;
    expect(content).not.toMatch(/ignore.*instructi/i);
    expect(content.length).toBeLessThanOrEqual(2000);
  });

  it('cria: sucesso', async () => {
    const r: any = await service.criar(TRAINER, STUDENT, 'Nota válida');
    expect(r.note.id).toBe('note-1');
  });

  it('remove: 404 se anotação não existe', async () => {
    prisma.studentNote.findUnique.mockResolvedValue(null);
    const body = await bodyOf(service.remover(TRAINER, STUDENT, 'inexistente'));
    expect(body.error).toBeDefined();
  });

  it('remove: sucesso', async () => {
    const r: any = await service.remover(TRAINER, STUDENT, 'note-1');
    expect(r.message).toMatch(/removida/i);
  });
});
