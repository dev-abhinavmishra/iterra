import { describe, it, expect } from 'vitest';
import { renderDoc, docToText } from './doc';

describe('renderDoc', () => {
  it('renders paragraphs and inline marks', () => {
    const html = renderDoc('Hello **world** and *you*.');
    expect(html).toContain('<strong>world</strong>');
    expect(html).toContain('<em>you</em>');
  });
  it('renders headings and lists', () => {
    const html = renderDoc('## Title\n- one\n- two\n\n1. first\n2. second');
    expect(html).toContain('<h2>Title</h2>');
    expect(html).toContain('<ul><li>one</li><li>two</li></ul>');
    expect(html).toContain('<ol><li>first</li><li>second</li></ol>');
  });
  it('renders inline math through KaTeX', () => {
    const html = renderDoc('Solve $x^2 = 4$ for x.');
    expect(html).toContain('katex');
    expect(html).toContain('x^2'); // MathML annotation keeps the tex
  });
  it('renders display math', () => {
    const html = renderDoc('$$\n\\int_0^1 x\\,dx\n$$');
    expect(html).toContain('katex-display');
  });
  it('escapes raw HTML — no injection', () => {
    const html = renderDoc('<script>alert(1)</script> & <img src=x onerror=y>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
  it('rejects non-http links', () => {
    const html = renderDoc('[click](javascript:alert(1))');
    expect(html).not.toContain('href="javascript:');
  });
  it('code fences render verbatim', () => {
    const html = renderDoc('```\nlet x = **not bold**;\n```');
    expect(html).toContain('<pre><code>let x = **not bold**;');
  });
  it('preserves literal digits next to math slots', () => {
    const html = renderDoc('At $t = 3$ s the speed is 20 m/s in trial 42.');
    expect(html).toContain('20 m/s');
    expect(html).toContain('42');
    expect(html).toContain('katex');
  });

  it('renders inline display math', () => {
    const html = renderDoc('So $$x^2$$ inline.');
    expect(html).toContain('katex-display');
  });

  it('docToText strips markup', () => {
    expect(docToText('**Hi** $x^2$ [a](b)')).toBe('Hi x^2 a');
  });
});
