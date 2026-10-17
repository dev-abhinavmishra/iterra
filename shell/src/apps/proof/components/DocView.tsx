import { useMemo } from 'react';
import { renderDoc } from '../lib/doc';
import { cn } from '../lib/utils';

/** Renders a markdown+$LaTeX$ doc to sanitized HTML. */
export function DocView({ doc, className }: { doc: string; className?: string }) {
  const html = useMemo(() => renderDoc(doc), [doc]);
  if (!doc.trim()) return null;
  return <div className={cn('doc', className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
