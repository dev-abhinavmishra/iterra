import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { WorkspaceHomeButton } from './WorkspaceHomeButton';

it('names the home control for assistive technology independently of its compact glyph', () => {
  const markup = renderToStaticMarkup(<WorkspaceHomeButton onClick={() => {}} />);
  expect(markup).toContain('aria-label="Iterra workspace — Today"');
  expect(markup).toContain('>i</span>');
});
