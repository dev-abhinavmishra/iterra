// ── Document renderer ────────────────────────────────────────────────────────
// Markdown subset + $inline$ / $$block$$ math via KaTeX. All input text is
// escaped first — no raw HTML is ever injected. Links restricted to
// http(s)/mailto. Images only from data: or http(s) URLs.

import katex from 'katex';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderMath(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode: display,
      throwOnError: false,
      output: 'htmlAndMathml',
      strict: 'ignore',
    });
  } catch {
    return `<code>${esc(tex)}</code>`;
  }
}

function inline(src: string): string {
  let s = esc(src);
  // inline math first so md rules don't touch tex internals
  const mathSlots: string[] = [];
  s = s.replace(/\$\$([^$\n]+?)\$\$/g, (_, tex) => {
    mathSlots.push(renderMath(tex, true));
    return `\x00${mathSlots.length - 1}\x00`;
  });
  s = s.replace(/\$([^$\n]+?)\$/g, (_, tex) => {
    mathSlots.push(renderMath(tex, false));
    return `\x00${mathSlots.length - 1}\x00`;
  });
  s = s
    .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
    .replace(/(\d)\s*\*\s*(\d)/g, '$1×$2')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');
  // images ![alt](url)
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => {
    const u = String(url);
    if (/^(data:image\/|https?:\/\/)/.test(u)) {
      return `<img src="${u}" alt="${alt}" loading="lazy" />`;
    }
    return `<code>${alt || 'image'}</code>`;
  });
  // links [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, url) => {
    const u = String(url);
    if (/^(https?:\/\/|mailto:)/.test(u)) {
      return `<a href="${u}" target="_blank" rel="noreferrer noopener">${text}</a>`;
    }
    return text;
  });
  // restore math
  s = s.replace(/\x00(\d+)\x00/g, (_, i) => mathSlots[Number(i)] ?? '');
  return s;
}

/** Render a markdown+math doc to safe HTML. */
export function renderDoc(src: string): string {
  if (!src || !src.trim()) return '';
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let para: string[] = [];
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null;
  let inCode = false;
  let codeBuf: string[] = [];
  let inMath = false;
  let mathBuf: string[] = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inline(para.join(' '))}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      out.push(`<${list.type}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.type}>`);
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw;
    if (/^```/.test(line.trim())) {
      if (inCode) {
        out.push(`<pre><code>${esc(codeBuf.join('\n'))}</code></pre>`);
        codeBuf = [];
        inCode = false;
      } else {
        flushPara();
        flushList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }
    if (/^\s*\$\$\s*$/.test(line)) {
      if (inMath) {
        out.push(renderMath(mathBuf.join('\n'), true));
        mathBuf = [];
        inMath = false;
      } else {
        flushPara();
        flushList();
        inMath = true;
      }
      continue;
    }
    if (inMath) {
      mathBuf.push(line);
      continue;
    }

    // single-line display math $$...$$
    const dm = line.trim().match(/^\$\$(.+)\$\$$/);
    if (dm) {
      flushPara();
      flushList();
      out.push(renderMath(dm[1], true));
      continue;
    }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushPara();
      flushList();
      const lvl = h[1].length;
      out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
      continue;
    }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      flushPara();
      flushList();
      out.push('<hr/>');
      continue;
    }
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const type = ul ? 'ul' : 'ol';
      const text = (ul ? ul[1] : ol![1]) as string;
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push(text);
      continue;
    }
    const bq = line.match(/^\s*>\s?(.*)$/);
    if (bq) {
      flushPara();
      flushList();
      out.push(`<blockquote>${inline(bq[1])}</blockquote>`);
      continue;
    }
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    para.push(line.trim());
  }
  if (inCode) out.push(`<pre><code>${esc(codeBuf.join('\n'))}</code></pre>`);
  if (inMath) out.push(renderMath(mathBuf.join('\n'), true));
  flushPara();
  flushList();
  return out.join('\n');
}

/** Strip a doc to plain text for previews/search. */
export function docToText(src: string, max = 160): string {
  const t = src
    .replace(/\$\$[^$]*\$\$/g, ' [math] ')
    .replace(/\$([^$\n]+)\$/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' [image] ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\d)\s*\*\s*(\d)/g, '$1×$2')
    .replace(/[#*_`>~-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}
