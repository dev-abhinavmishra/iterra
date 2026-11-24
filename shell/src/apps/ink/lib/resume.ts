/* Resume anchors — where the pen was last resting, in terms that survive
   edits. The caret is recorded as (textblock ordinal, char offset inside
   that textblock's flat text) rather than a raw ProseMirror position:
   positions shift with every keystroke, ordinals and offsets mostly don't.
   Resolution is best-effort — a block that no longer exists yields null and
   the resume chip simply doesn't appear. */
import type { Node, ResolvedPos } from '@tiptap/pm/model';

export interface AnchorPoint {
  /** Ordinal of the textblock among all textblocks in document order. */
  block: number;
  /** Caret offset inside the textblock's textContent. */
  offset: number;
}

/* The caret's position measured in characters of the textblock's flat
   textContent — doc positions count leaf nodes (a hardBreak takes one)
   that textContent skips, so text lookups need the translation. */
const textOffsetIn = ($pos: ResolvedPos): number => {
  let textOffset = 0;
  $pos.parent.forEach((child, childOffset) => {
    if (childOffset < $pos.parentOffset && child.isText && child.text) {
      textOffset += Math.min(child.text.length, $pos.parentOffset - childOffset);
    }
  });
  return textOffset;
};

/** Caret → anchor. Null when the caret isn't inside a textblock (e.g. an
    atom node or the doc gap between blocks). */
export function anchorFromSelection($pos: ResolvedPos): AnchorPoint | null {
  if (!$pos.parent.isTextblock) return null;
  // $pos.pos - parentOffset - 1 is the textblock's own doc position:
  // parentOffset counts doc positions from the start of the parent's content.
  const nodePos = $pos.pos - $pos.parentOffset - 1;
  let block = -1;
  let seen = 0;
  $pos.doc.descendants((node, pos) => {
    if (block >= 0 || !node.isTextblock) return block < 0;
    if (pos === nodePos) { block = seen; return false; }
    seen++;
    return true;
  });
  if (block < 0) return null;
  return { block, offset: textOffsetIn($pos) };
}

/** Anchor → doc position for setTextSelection. Walks the textblock's inline
    content translating the char offset into a doc offset; non-text leaves
    (hardBreak) occupy doc positions but no text, so they shift the result
    without consuming offset. Returns null when the block is gone. */
export function posForAnchor(doc: Node, anchor: AnchorPoint): number | null {
  let seen = -1;
  const found: { pos: number; node: Node }[] = [];
  doc.descendants((node, pos) => {
    if (found.length || !node.isTextblock) return !found.length;
    seen++;
    if (seen === anchor.block) {
      found.push({ pos, node });
      return false;
    }
    return true;
  });
  const target = found[0];
  if (!target) return null;
  const { pos, node } = target;
  if (anchor.offset <= 0) return pos + 1;
  const end = pos + 1 + node.content.size;
  let textSeen = 0;
  let result: number | null = null;
  node.forEach((child, childOffset) => {
    if (result !== null) return;
    const len = child.isText ? child.text?.length ?? 0 : 0;
    if (child.isText && child.text && anchor.offset <= textSeen + len) {
      result = pos + 1 + childOffset + (anchor.offset - textSeen);
      return;
    }
    textSeen += len;
  });
  return result ?? end;
}
