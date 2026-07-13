import { DOMMatrix, DOMPoint, DOMRect, ImageData, Path2D } from '@napi-rs/canvas';

type PdfJsGlobal = Record<'DOMMatrix' | 'DOMPoint' | 'DOMRect' | 'ImageData' | 'Path2D', unknown>;

/**
 * PDF.js uses a small set of browser canvas globals while its module is being
 * evaluated. Electron's main process is a Node.js environment, so install
 * their native equivalents before dynamically importing PDF.js.
 */
export const ensurePdfJsNodeGlobals = (): void => {
  const target = globalThis as unknown as PdfJsGlobal;
  target.DOMMatrix ??= DOMMatrix;
  target.DOMPoint ??= DOMPoint;
  target.DOMRect ??= DOMRect;
  target.ImageData ??= ImageData;
  target.Path2D ??= Path2D;
};

ensurePdfJsNodeGlobals();
