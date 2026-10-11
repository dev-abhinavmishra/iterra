import DOMPurify from 'dompurify';

/* One place to clean any HTML before it reaches the DOM. Model output,
   imported files, and restored backups are all untrusted: DOMPurify strips
   scripts, event handlers and javascript: URLs while keeping the markup the
   app actually produces (headings, lists, tables, marks, images). */
export const sanitizeHtml = (html: string): string =>
    DOMPurify.sanitize(html || '', {
        USE_PROFILES: { html: true },
        ADD_ATTR: ['target'],
    });
