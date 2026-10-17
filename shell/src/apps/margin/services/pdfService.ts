// Client-side PDF text extraction using pdf.js.
//
// The free vision providers can't ingest PDFs directly (only images), so we pull
// the text out in the browser and feed it to the text note generator instead.
import * as pdfjsLib from 'pdfjs-dist';
// Vite resolves this to a hashed worker URL at build time.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export const extractPdfText = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const strings = textContent.items.map((item: any) => (item.str || ''));
        pages.push(strings.join(' '));
    }
    return pages.join('\n\n').trim();
};
