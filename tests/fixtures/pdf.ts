import { PDFDocument, StandardFonts } from '@pdfme/pdf-lib';
import { writeFile } from 'node:fs/promises';

export const createFixturePdf = async (targetPath: string, text = 'Yinxu oracle bone ritual study'): Promise<void> => {
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText(text, { x: 48, y: 780, size: 14, font });
  await writeFile(targetPath, await document.save());
};
