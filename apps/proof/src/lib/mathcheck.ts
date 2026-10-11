// ── Deterministic math checking ──────────────────────────────────────────────
// A small expression parser + evaluator powering the layered checker:
// exact string, normalized numeric, unit tolerance, and constrained symbolic
// equivalence (multi-point sampling). No AI anywhere — every verdict is a
// computed fact, and symbolic equivalence is reported honestly as
// "equal at sampled points".

export interface ParseResult {
  ok: boolean;
  error?: string;
  eval?: (vars: Record<string, number>) => number;
  vars?: string[];
}

type Tok =
  | { t: 'num'; v: number }
  | { t: 'name'; v: string }
  | { t: 'op'; v: string }
  | { t: 'lp' }
  | { t: 'rp' }
  | { t: 'comma' };

const FUNCS = new Set([
  'sqrt', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'exp', 'ln', 'log', 'abs', 'floor', 'ceil', 'min', 'max',
]);
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };

function tokenize(src: string): Tok[] | string {
  const toks: Tok[] = [];
  let i = 0;
  const s = src.replace(/\s+/g, '');
  while (i < s.length) {
    const c = s[i];
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const raw = s.slice(i, j);
      if ((raw.match(/\./g) ?? []).length > 1) return `Bad number '${raw}'`;
      toks.push({ t: 'num', v: parseFloat(raw) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < s.length && /[a-zA-Z_0-9]/.test(s[j])) j++;
      toks.push({ t: 'name', v: s.slice(i, j) });
      i = j;
      continue;
    }
    if (c === '(') { toks.push({ t: 'lp' }); i++; continue; }
    if (c === ')') { toks.push({ t: 'rp' }); i++; continue; }
    if (c === ',') { toks.push({ t: 'comma' }); i++; continue; }
    if ('+-*/^%'.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
    if (c === '=') return "Equations aren't checkable — give one side's expression";
    return `Unexpected character '${c}'`;
  }
  // insert implicit multiplication: num|rp|name followed by name|lp|num
  const out: Tok[] = [];
  for (let k = 0; k < toks.length; k++) {
    out.push(toks[k]);
    const a = toks[k];
    const b = toks[k + 1];
    if (!b) continue;
    const aVal = a.t === 'num' || a.t === 'rp' || (a.t === 'name' && !FUNCS.has(a.v));
    const bVal = b.t === 'num' || b.t === 'lp' || b.t === 'name';
    if (aVal && bVal) out.push({ t: 'op', v: '*' });
  }
  return out;
}

// recursive descent: expr → term (+- term)* ; term → pow (*/ pow)* ;
// pow → unary (^ pow)? ; unary → (-|+) unary | atom ;
// atom → num | name | name '(' args ')' | '(' expr ')'
export function parseExpression(src: string): ParseResult {
  const toks = tokenize(src);
  if (typeof toks === 'string') return { ok: false, error: toks };
  if (!toks.length) return { ok: false, error: 'Empty expression' };
  const vars = new Set<string>();
  let pos = 0;
  const peek = () => toks[pos];
  const next = () => toks[pos++];

  type Node = (v: Record<string, number>) => number;

  function parseExpr(): Node | string {
    let left = parseTerm();
    if (typeof left === 'string') return left;
    while (peek()?.t === 'op' && (peek() as { v: string }).v !== '^' && '+-'.includes((peek() as { v: string }).v)) {
      const op = (next() as { v: string }).v;
      const right = parseTerm();
      if (typeof right === 'string') return right;
      const l: Node = left, r: Node = right;
      left = op === '+' ? (v: Record<string, number>) => l(v) + r(v) : (v: Record<string, number>) => l(v) - r(v);
    }
    return left;
  }
  function parseTerm(): Node | string {
    let left = parsePow();
    if (typeof left === 'string') return left;
    while (peek()?.t === 'op' && '*/%'.includes((peek() as { v: string }).v)) {
      const op = (next() as { v: string }).v;
      const right = parsePow();
      if (typeof right === 'string') return right;
      const l: Node = left, r: Node = right;
      left =
        op === '*' ? (v: Record<string, number>) => l(v) * r(v)
        : op === '/' ? (v: Record<string, number>) => l(v) / r(v)
        : (v: Record<string, number>) => l(v) % r(v);
    }
    return left;
  }
  function parsePow(): Node | string {
    const base = parseUnary();
    if (typeof base === 'string') return base;
    if (peek()?.t === 'op' && (peek() as { v: string }).v === '^') {
      next();
      const ex = parsePow(); // right-associative
      if (typeof ex === 'string') return ex;
      return (v) => Math.pow(base(v), ex(v));
    }
    return base;
  }
  function parseUnary(): Node | string {
    if (peek()?.t === 'op' && '+-'.includes((peek() as { v: string }).v)) {
      const op = (next() as { v: string }).v;
      const inner = parseUnary();
      if (typeof inner === 'string') return inner;
      return op === '-' ? (v) => -inner(v) : inner;
    }
    return parseAtom();
  }
  function parseAtom(): Node | string {
    const t = next();
    if (!t) return 'Unexpected end of expression';
    if (t.t === 'num') {
      const n = t.v;
      return () => n;
    }
    if (t.t === 'name') {
      const name = t.v;
      if (peek()?.t === 'lp') {
        // function call
        if (!FUNCS.has(name)) return `Unknown function '${name}'`;
        next(); // consume (
        const args: Node[] = [];
        const first = parseExpr();
        if (typeof first === 'string') return first;
        args.push(first);
        while (peek()?.t === 'comma') {
          next();
          const a = parseExpr();
          if (typeof a === 'string') return a;
          args.push(a);
        }
        if (peek()?.t !== 'rp') return `Missing ')' after ${name}(`;
        next();
        return (v) => applyFunc(name, args.map((a) => a(v)));
      }
      if (name in CONSTS) {
        const c = CONSTS[name];
        return () => c;
      }
      vars.add(name);
      return (v) => {
        if (!(name in v)) throw new Error(`No value for '${name}'`);
        return v[name];
      };
    }
    if (t.t === 'lp') {
      const e = parseExpr();
      if (typeof e === 'string') return e;
      if (peek()?.t !== 'rp') return "Missing ')'";
      next();
      return e;
    }
    return `Unexpected '${'v' in t ? t.v : t.t}'`;
  }

  const root = parseExpr();
  if (typeof root === 'string') return { ok: false, error: root };
  if (pos < toks.length) return { ok: false, error: `Unexpected extra input near token ${pos + 1}` };
  return { ok: true, eval: root, vars: [...vars] };
}

function applyFunc(name: string, a: number[]): number {
  switch (name) {
    case 'sqrt': return Math.sqrt(a[0]);
    case 'sin': return Math.sin(a[0]);
    case 'cos': return Math.cos(a[0]);
    case 'tan': return Math.tan(a[0]);
    case 'asin': return Math.asin(a[0]);
    case 'acos': return Math.acos(a[0]);
    case 'atan': return Math.atan(a[0]);
    case 'exp': return Math.exp(a[0]);
    case 'ln': return Math.log(a[0]);
    case 'log': return Math.log10(a[0]);
    case 'abs': return Math.abs(a[0]);
    case 'floor': return Math.floor(a[0]);
    case 'ceil': return Math.ceil(a[0]);
    case 'min': return Math.min(...a);
    case 'max': return Math.max(...a);
    default: return NaN;
  }
}

// ── value comparisons ──

export function nearlyEqual(a: number, b: number, absTol = 1e-6, relTol = 1e-4): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const diff = Math.abs(a - b);
  if (diff <= absTol) return true;
  return diff <= relTol * Math.max(Math.abs(a), Math.abs(b));
}

/** Parse a numeric answer that may carry a unit: '3.2 m/s^2', '-4.5e2 N' */
export function parseNumericWithUnit(src: string): { value: number; unit?: string } | null {
  const m = src.trim().match(/^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*(.*)$/);
  if (!m) return null;
  const value = parseFloat(m[1]);
  if (!Number.isFinite(value)) return null;
  const unit = m[2].trim() || undefined;
  return { value, unit };
}

export function normalizeUnit(u: string): string {
  let t = u
    .replace(/·/g, '*')
    .replace(/×/g, '*')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    // space-separated factors multiply: 'kg m^2' → 'kg*m^2'
    .replace(/\s*([*/^])\s*/g, '$1')
    .replace(/\s+/g, '*')
    .toLowerCase();
  return t;
}

/**
 * Constrained symbolic equivalence: evaluate both sides at several
 * deterministic sample points. Reported honestly — "equal at sampled
 * points" is strong evidence, not a proof.
 */
export function expressionsEquivalent(
  givenSrc: string,
  expectedSrc: string,
  declaredVars?: string[],
): { equivalent: boolean; reason: string } {
  const g = parseExpression(givenSrc);
  if (!g.ok || !g.eval) return { equivalent: false, reason: g.error ?? 'Could not parse your expression' };
  const e = parseExpression(expectedSrc);
  if (!e.ok || !e.eval) return { equivalent: false, reason: 'Problem answer is not parseable' };

  const varSet = new Set([...(g.vars ?? []), ...(e.vars ?? [])]);
  if (declaredVars) for (const v of declaredVars) varSet.add(v);
  const vars = [...varSet];
  // any name appearing on only one side still must be bound — the expected
  // side's vars are the universe; extra names on the given side are unbound
  // and simply never equal a constant expected value.
  const extraGiven = (g.vars ?? []).filter((v) => !(e.vars ?? []).includes(v));

  const SAMPLES = 8;
  let matched = 0;
  try {
    for (let i = 0; i < SAMPLES; i++) {
      const bind: Record<string, number> = {};
      for (const v of vars) {
        // deterministic pseudo-random samples in (-3, 3) avoiding 0
        const h = Math.abs(Math.sin(i * 97.13 + v.length * 31.7 + v.charCodeAt(0) * 7.3));
        bind[v] = 0.31 + (h % 1) * 2.5 + (i % 3) * 0.13;
      }
      const gv = g.eval(bind);
      const ev = e.eval(bind);
      if (!Number.isFinite(gv) || !Number.isFinite(ev)) {
        // both blowing up at the same point is weak evidence; skip the point
        if (!Number.isFinite(gv) && !Number.isFinite(ev)) { matched++; continue; }
        return { equivalent: false, reason: 'Expressions differ — one is undefined where the other is not' };
      }
      if (nearlyEqual(gv, ev, 1e-6, 1e-5)) matched++;
      else
        return {
          equivalent: false,
          reason: `Different value at sample point (${vars.map((v) => `${v}=${bind[v].toFixed(2)}`).join(', ')})`,
        };
    }
  } catch (err) {
    return { equivalent: false, reason: err instanceof Error ? err.message : 'Evaluation failed' };
  }
  if (extraGiven.length) {
    return {
      equivalent: false,
      reason: `Your expression uses ${extraGiven.join(', ')} which does not appear in the expected answer`,
    };
  }
  return { equivalent: true, reason: `Equal at ${matched} sampled points` };
}

/** Normalize a plain-text exact answer for comparison. */
export function normalizeExact(s: string, caseSensitive = false): string {
  let t = s.trim().replace(/\s+/g, ' ');
  if (!caseSensitive) t = t.toLowerCase();
  return t
    .replace(/[,;:'"!?()]/g, '') // prose punctuation never matters
    .replace(/\.(?!\d)/g, '') // periods unless inside a decimal
    .trim();
}
