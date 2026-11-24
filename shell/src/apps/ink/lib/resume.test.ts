// Contract pin — resume anchors: caret → (textblock, offset) and back.
// Pure ProseMirror-model helpers; a minimal schema keeps the test honest
// about doc positions without needing the editor.
import { describe, expect, it } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { anchorFromSelection, posForAnchor } from './resume';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    heading: { content: 'inline*', group: 'block', attrs: { level: { default: 2 } } },
    text: { group: 'inline' },
    hardBreak: { inline: true, group: 'inline', selectable: false },
  },
  marks: { bold: {} },
});

const para = (text: string) => ({
  type: 'paragraph',
  content: text ? [{ type: 'text', text }] : [],
});

const docOf = (content: unknown[]) =>
  schema.nodeFromJSON({ type: 'doc', content: content as never[] });

describe('anchorFromSelection', () => {
  it('captures the textblock ordinal and text offset', () => {
    const doc = docOf([para('Hello world'), para('Second page')]);
    // pos 7 = inside "Hello world" after "Hello " (offset 6)
    const anchor = anchorFromSelection(doc.resolve(7));
    expect(anchor).toEqual({ block: 0, offset: 6 });
  });

  it('counts nested textblocks in document order', () => {
    const doc = docOf([
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] },
      para('First'),
      para('Second'),
    ]);
    // second paragraph is textblock #2; "Second" content starts at doc pos 15
    const anchor = anchorFromSelection(doc.resolve(15 + 3));
    expect(anchor).toEqual({ block: 2, offset: 3 });
  });

  it('measures offset across split text nodes', () => {
    const doc = docOf([{
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'world', marks: [{ type: 'bold' }] },
      ],
    }]);
    // offset 8 → between 'o' and 'r' of "world"
    const anchor = anchorFromSelection(doc.resolve(9));
    expect(anchor).toEqual({ block: 0, offset: 8 });
  });
});

describe('posForAnchor', () => {
  it('round-trips a captured anchor', () => {
    const doc = docOf([para('Hello world'), para('Second page')]);
    const anchor = anchorFromSelection(doc.resolve(7));
    expect(anchor).not.toBeNull();
    expect(posForAnchor(doc, anchor!)).toBe(7);
  });

  it('resolves an anchor in a later block', () => {
    const doc = docOf([para('Hello world'), para('Second page')]);
    // p2 node pos = 13 (p1 nodeSize 13), content starts 14
    expect(posForAnchor(doc, { block: 1, offset: 3 })).toBe(17);
  });

  it('skips hardBreaks when mapping text offsets', () => {
    const doc = docOf([{
      type: 'paragraph',
      content: [
        { type: 'text', text: 'line one' },
        { type: 'hardBreak' },
        { type: 'text', text: 'line two' },
      ],
    }]);
    // textContent = "line oneline two"; offset 12 is 't' of "two" —
    // doc pos must account for the break node occupying one position.
    const pos = posForAnchor(doc, { block: 0, offset: 12 });
    expect(pos).not.toBeNull();
    const $pos = doc.resolve(pos!);
    expect($pos.parent.textContent.slice(0, 12)).toBe('line oneline');
  });

  it('returns null for a block that no longer exists', () => {
    const doc = docOf([para('only block')]);
    expect(posForAnchor(doc, { block: 5, offset: 0 })).toBeNull();
  });

  it('clamps an over-long offset to the end of the block', () => {
    const doc = docOf([para('short')]);
    // "short" is 5 chars — end of content sits at doc pos 6
    expect(posForAnchor(doc, { block: 0, offset: 999 })).toBe(6);
  });
});
