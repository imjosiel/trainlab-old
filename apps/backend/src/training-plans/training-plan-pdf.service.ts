import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PDFDocument, PDFFont, PDFPage, PDFPageDrawTextOptions, StandardFonts, rgb } from 'pdf-lib';

import { SessionPayload } from '@/auth/session-payload';
import { PrismaService } from '@/prisma/prisma.service';

export interface PdfResult {
  bytes: Buffer;
  filename: string;
}

/** Fatia 18 (D91) — primeira resposta binária do backend. Porte de `[id]/pdf/route.ts`. */
@Injectable()
export class TrainingPlanPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async gerar(id: string, user: SessionPayload): Promise<PdfResult> {
    const plan = await this.prisma.trainingPlan.findUnique({
      where: { id },
      include: {
        athlete: { select: { id: true, name: true, email: true } },
        student: { select: { id: true, name: true, email: true, userId: true } },
        trainer: { select: { id: true, name: true, email: true } },
        trainingSessions: { orderBy: { day: 'asc' } },
      },
    });
    if (!plan) throw new NotFoundException({ error: 'Plano não encontrado' });

    const isTrainer = plan.trainerId === user.id;
    const isAthlete = plan.athleteId === user.id;
    const isStudent = plan.student?.userId === user.id;
    if (!isTrainer && !isAthlete && !isStudent) throw new ForbiddenException({ error: 'Sem permissão' });

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pageWidth = 595;
    const pageHeight = 842;
    const margin = 50;
    const contentWidth = pageWidth - margin * 2;

    const green = rgb(0.1, 0.6, 0.2);
    const darkGray = rgb(0.2, 0.2, 0.2);
    const lightGray = rgb(0.5, 0.5, 0.5);
    const white = rgb(1, 1, 1);

    let page: PDFPage = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    const newPage = () => {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    };
    const checkY = (needed = 20) => {
      if (y - needed < margin + 40) newPage();
    };

    const drawText = (
      text: string,
      opts: Partial<PDFPageDrawTextOptions & { x?: number; size?: number; fontRef?: PDFFont; color?: ReturnType<typeof rgb>; maxWidth?: number }> = {},
    ) => {
      const { x = margin, size = 11, fontRef = font, color = darkGray, maxWidth = contentWidth } = opts;
      const words = String(text).split(' ');
      let line = '';
      const lines: string[] = [];
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (fontRef.widthOfTextAtSize(test, size) > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);
      for (const l of lines) {
        checkY(size + 4);
        page.drawText(l, { x, y, size, font: fontRef, color });
        y -= size + 4;
      }
    };

    page.drawRectangle({ x: 0, y: pageHeight - 100, width: pageWidth, height: 100, color: green });
    page.drawText('Player.Action', { x: margin, y: pageHeight - 45, size: 26, font: fontBold, color: white });
    page.drawText('Plano de Treino Personalizado', { x: margin, y: pageHeight - 68, size: 12, font, color: rgb(0.85, 1, 0.85) });
    page.drawText(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, {
      x: pageWidth - 180,
      y: pageHeight - 68,
      size: 10,
      font,
      color: rgb(0.85, 1, 0.85),
    });
    y = pageHeight - 120;

    const targetAthlete = plan.student ?? plan.athlete ?? { name: 'Praticante', email: '' };
    page.drawRectangle({ x: margin, y: y - 60, width: contentWidth, height: 68, color: rgb(0.95, 0.98, 0.95) });
    page.drawRectangle({ x: margin, y: y - 60, width: 4, height: 68, color: green });
    page.drawText('Atleta:', { x: margin + 14, y: y - 18, size: 10, font, color: lightGray });
    page.drawText(targetAthlete.name ?? 'Praticante', { x: margin + 14, y: y - 32, size: 14, font: fontBold, color: darkGray });
    if (targetAthlete.email) page.drawText(targetAthlete.email, { x: margin + 14, y: y - 46, size: 9, font, color: lightGray });
    const durationText = `${plan.duration} dias`;
    const durationW = fontBold.widthOfTextAtSize(durationText, 22);
    page.drawText(durationText, { x: pageWidth - margin - durationW, y: y - 32, size: 22, font: fontBold, color: green });
    page.drawText('de duração', { x: pageWidth - margin - fontBold.widthOfTextAtSize('de duração', 9), y: y - 48, size: 9, font, color: lightGray });
    if (plan.trainer) page.drawText(`Treinador: ${plan.trainer.name}`, { x: margin + 14, y: y - 60, size: 8, font, color: lightGray });
    y -= 80;

    page.drawText(plan.title, { x: margin, y, size: 16, font: fontBold, color: darkGray });
    y -= 24;
    page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
    y -= 16;

    const content = plan.finalPlan ?? plan.aiSuggestion ?? '';
    const rawLines = content.split('\n');
    for (const raw of rawLines) {
      const line = raw.trim();
      if (!line) {
        y -= 6;
        continue;
      }
      if (line.startsWith('# ')) {
        checkY(24);
        y -= 8;
        drawText(line.replace(/^# /, ''), { size: 16, fontRef: fontBold, color: green });
        y -= 4;
      } else if (line.startsWith('## ')) {
        checkY(20);
        y -= 6;
        drawText(line.replace(/^## /, ''), { size: 13, fontRef: fontBold, color: darkGray });
        y -= 2;
      } else if (line.startsWith('### ') || line.startsWith('#### ')) {
        checkY(16);
        y -= 4;
        drawText(line.replace(/^#{3,4} /, ''), { size: 11, fontRef: fontBold, color: rgb(0.2, 0.5, 0.2) });
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        const t = line.replace(/^[-*] /, '');
        checkY(14);
        page.drawCircle({ x: margin + 6, y: y + 3, size: 2, color: green });
        drawText(t, { x: margin + 16, size: 10, maxWidth: contentWidth - 16 });
      } else if (line.startsWith('**') && line.endsWith('**')) {
        drawText(line.replace(/\*\*/g, ''), { size: 10, fontRef: fontBold, color: darkGray });
      } else {
        drawText(line.replace(/\*\*/g, ''), { size: 10 });
      }
    }

    if (plan.trainingSessions && plan.trainingSessions.length > 0) {
      newPage();
      y -= 10;
      drawText('DETALHAMENTO DIÁRIO DAS SESSÕES', { size: 18, fontRef: fontBold, color: green });
      y -= 10;
      page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 2, color: green });
      y -= 25;

      for (const sess of plan.trainingSessions) {
        checkY(60);
        y -= 15;
        page.drawRectangle({ x: margin, y: y - 25, width: contentWidth, height: 30, color: rgb(0.9, 0.95, 0.9) });
        page.drawText(`DIA ${sess.day}: ${sess.title}`, { x: margin + 10, y: y - 5, size: 12, font: fontBold, color: green });
        if (sess.duration) {
          const durText = `${sess.duration} min`;
          page.drawText(durText, { x: pageWidth - margin - font.widthOfTextAtSize(durText, 10) - 10, y: y - 5, size: 10, font, color: darkGray });
        }
        y -= 40;
        if (sess.description) {
          drawText(sess.description, { size: 9, color: lightGray, maxWidth: contentWidth - 20, x: margin + 10 });
          y -= 10;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let exercises: any[] = [];
        try {
          exercises = sess.exercises ? JSON.parse(sess.exercises) : [];
        } catch {
          exercises = [];
        }

        if (exercises.length > 0) {
          y -= 5;
          checkY(20);
          page.drawRectangle({ x: margin + 10, y: y - 15, width: contentWidth - 20, height: 15, color: rgb(0.96, 0.96, 0.96) });
          page.drawText('EXERCÍCIO', { x: margin + 15, y: y - 5, size: 8, font: fontBold, color: darkGray });
          page.drawText('SÉRIES', { x: margin + 250, y: y - 5, size: 8, font: fontBold, color: darkGray });
          page.drawText('REPS', { x: margin + 310, y: y - 5, size: 8, font: fontBold, color: darkGray });
          page.drawText('DESCANSO', { x: margin + 370, y: y - 5, size: 8, font: fontBold, color: darkGray });
          y -= 20;
          for (const ex of exercises) {
            checkY(25);
            page.drawRectangle({ x: margin + 15, y, width: 10, height: 10, borderWidth: 1, borderColor: lightGray });
            page.drawText(ex.name, { x: margin + 30, y: y + 1, size: 9, font, color: darkGray });
            page.drawText(String(ex.sets ?? '-'), { x: margin + 250, y: y + 1, size: 9, font, color: darkGray });
            page.drawText(String(ex.reps ?? '-'), { x: margin + 310, y: y + 1, size: 9, font, color: darkGray });
            page.drawText(ex.restSeconds ? `${ex.restSeconds}s` : '-', { x: margin + 370, y: y + 1, size: 9, font, color: darkGray });
            if (ex.notes) {
              y -= 12;
              page.drawText(`Obs: ${ex.notes}`, { x: margin + 30, y: y + 2, size: 7, font, color: lightGray });
            }
            y -= 18;
            page.drawLine({ start: { x: margin + 10, y: y + 5 }, end: { x: pageWidth - margin - 10, y: y + 5 }, thickness: 0.2, color: rgb(0.9, 0.9, 0.9) });
          }
        }
        y -= 15;
      }
    }

    const pages = pdfDoc.getPages();
    pages.forEach((pg, idx) => {
      pg.drawLine({ start: { x: margin, y: 40 }, end: { x: pageWidth - margin, y: 40 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
      pg.drawText('Player.Action © 2026 — Plataforma de Treinos com IA', { x: margin, y: 25, size: 8, font, color: lightGray });
      pg.drawText(`Página ${idx + 1} de ${pages.length}`, { x: pageWidth - margin - 60, y: 25, size: 8, font, color: lightGray });
    });

    const pdfBytes = await pdfDoc.save();
    const safeName = (targetAthlete.name ?? 'aluno').replace(/[^a-zA-Z0-9]/g, '_');

    return { bytes: Buffer.from(pdfBytes), filename: `plano_treino_${safeName}.pdf` };
  }
}
