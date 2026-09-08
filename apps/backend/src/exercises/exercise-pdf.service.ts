import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';

import { SessionPayload } from '@/auth/session-payload';
import { PrismaService } from '@/prisma/prisma.service';

export interface PdfResult {
  bytes: Buffer;
  filename: string;
}

/**
 * Fatia 23 — cheat sheet em PDF do exercício. Porte de `[id]/pdf/route.ts`,
 * mesmo padrão do `TrainingPlanPdfService` (D91, fatia 18).
 *
 * Sem o bypass de "aluno com plano ativo" que `ExercisesService.buscar` tem
 * — é assim no legado, preservado (o cheat sheet não é material do curso,
 * é ferramenta de trabalho do treinador).
 */
@Injectable()
export class ExercisePdfService {
  constructor(private readonly prisma: PrismaService) {}

  async gerar(id: string, user: SessionPayload): Promise<PdfResult> {
    const exercise = await this.prisma.exercise.findUnique({ where: { id } });
    if (!exercise) throw new NotFoundException({ error: 'Exercício não encontrado' });

    const isGlobal = exercise.trainerId === null;
    const isOwner = exercise.trainerId === user.id;
    const isSystemAdmin = user.isAdmin;
    if (!isGlobal && !isOwner && !isSystemAdmin) {
      throw new ForbiddenException({ error: 'Sem permissão para acessar este exercício.' });
    }

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pageWidth = 595;
    const pageHeight = 842;
    const margin = 50;
    const contentWidth = pageWidth - margin * 2;

    const primaryColor = rgb(0.1, 0.6, 0.2);
    const darkGray = rgb(0.2, 0.2, 0.2);
    const lightGray = rgb(0.5, 0.5, 0.5);
    const white = rgb(1, 1, 1);

    let page: PDFPage = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    page.drawRectangle({ x: 0, y: pageHeight - 120, width: pageWidth, height: 120, color: primaryColor });
    page.drawText('Player.Action Cheat Sheet', { x: margin, y: pageHeight - 50, size: 24, font: fontBold, color: white });
    page.drawText('Aula Técnica de Alta Performance', { x: margin, y: pageHeight - 75, size: 12, font, color: white });
    y = pageHeight - 150;

    page.drawText(exercise.name.toUpperCase(), { x: margin, y, size: 20, font: fontBold, color: primaryColor });
    y -= 30;

    page.drawRectangle({ x: margin, y: y - 40, width: contentWidth, height: 40, color: rgb(0.95, 0.98, 0.95) });
    page.drawText(`Categoria: ${exercise.category}`, { x: margin + 15, y: y - 25, size: 10, font: fontBold, color: darkGray });
    page.drawText(`Nível: ${exercise.difficulty}`, { x: margin + 180, y: y - 25, size: 10, font: fontBold, color: darkGray });
    page.drawText(`ID: ${exercise.id.substring(0, 8)}`, { x: pageWidth - margin - 100, y: y - 25, size: 8, font, color: lightGray });
    y -= 70;

    page.drawText('DESCRIÇÃO E ORIENTAÇÕES TÉCNICAS', { x: margin, y, size: 12, font: fontBold, color: darkGray });
    y -= 10;
    page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 1, color: primaryColor });
    y -= 25;

    const drawWrappedText = (text: string, startY: number, sz = 11, clr = darkGray, f: PDFFont = font): number => {
      const words = text.split(' ');
      let line = '';
      let currentY = startY;
      for (const word of words) {
        const testLine = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(testLine, sz) > contentWidth) {
          page.drawText(line, { x: margin, y: currentY, size: sz, font: f, color: clr });
          line = word;
          currentY -= sz + 5;
        } else {
          line = testLine;
        }
        if (currentY < margin) {
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          currentY = pageHeight - margin;
        }
      }
      if (line) {
        page.drawText(line, { x: margin, y: currentY, size: sz, font: f, color: clr });
        currentY -= sz + 5;
      }
      return currentY;
    };

    const descText =
      exercise.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ||
      'Nenhuma descrição técnica disponível para este exercício.';
    y = drawWrappedText(descText, y);
    y -= 40;

    if (exercise.videoUrl) {
      page.drawRectangle({ x: margin, y: y - 50, width: contentWidth, height: 50, color: rgb(0.9, 0.9, 0.9) });
      page.drawText('VÍDEO DE APOIO DISPONÍVEL NA PLATAFORMA', { x: margin + 15, y: y - 20, size: 9, font: fontBold, color: darkGray });
      page.drawText('Escaneie o código no dashboard ou acesse o link da aula.', { x: margin + 15, y: y - 35, size: 8, font, color: lightGray });
    }
    y -= 100;

    const footerY = 50;
    page.drawLine({ start: { x: margin, y: footerY + 20 }, end: { x: pageWidth - margin, y: footerY + 20 }, thickness: 0.5, color: lightGray });
    page.drawText('Este documento é parte integrante da metodologia Player.Action.', { x: margin, y: footerY, size: 8, font, color: lightGray });
    page.drawText('Página 1 de 1', { x: pageWidth - margin - 60, y: footerY, size: 8, font, color: lightGray });

    const pdfBytes = await pdfDoc.save();
    const safeName = exercise.name.replace(/[^a-zA-Z0-9]/g, '_');

    return { bytes: Buffer.from(pdfBytes), filename: `cheat_sheet_${safeName}.pdf` };
  }
}
