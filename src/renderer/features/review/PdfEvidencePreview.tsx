import { useEffect, useRef, useState } from 'react';
import { Alert, Skeleton, Typography } from 'antd';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

const documentCache = new Map<string, Promise<PDFDocumentProxy>>();

const loadDocument = (projectId: string): Promise<PDFDocumentProxy> => {
  const existing = documentCache.get(projectId);
  if (existing) return existing;
  const pending = window.yinxu
    .getSourcePdf(projectId)
    .then((bytes) => getDocument({ data: new Uint8Array(bytes) }).promise);
  documentCache.set(projectId, pending);
  return pending;
};

export const clampPdfPage = (page: number, pageCount: number): number => Math.min(Math.max(Math.trunc(page) || 1, 1), Math.max(pageCount, 1));

export const PdfEvidencePreview = ({ projectId, page }: { projectId: string; page: number }): React.JSX.Element => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [renderedPage, setRenderedPage] = useState(page);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    let renderTask: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    setLoading(true);
    setError(undefined);
    void loadDocument(projectId)
      .then(async (document) => {
        const targetPage = clampPdfPage(page, document.numPages);
        const pdfPage = await document.getPage(targetPage);
        const viewport = pdfPage.getViewport({ scale: 1.35 });
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context || cancelled) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        renderTask = pdfPage.render({ canvas, canvasContext: context, viewport });
        await renderTask.promise;
        if (!cancelled) setRenderedPage(targetPage);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'PDF 页面读取失败。');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [page, projectId]);

  return (
    <div className="pdf-evidence-preview">
      <Typography.Text type="secondary">原 PDF 第 {renderedPage} 页</Typography.Text>
      {loading ? <Skeleton active paragraph={{ rows: 8 }} /> : null}
      {error ? <Alert type="error" showIcon message={error} /> : null}
      <canvas ref={canvasRef} aria-label={`原 PDF 第 ${renderedPage} 页预览`} className={loading || error ? 'pdf-canvas-hidden' : 'pdf-evidence-canvas'} />
    </div>
  );
};
