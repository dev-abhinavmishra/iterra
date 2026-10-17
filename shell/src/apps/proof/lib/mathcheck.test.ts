import { describe, it, expect } from 'vitest';
import {
  parseExpression,
  expressionsEquivalent,
  parseNumericWithUnit,
  normalizeUnit,
  nearlyEqual,
  normalizeExact,
} from './mathcheck';

describe('parseExpression', () => {
  it('evaluates arithmetic', () => {
    const r = parseExpression('2 + 3 * 4');
    expect(r.ok).toBe(true);
    expect(r.eval!({})).toBe(14);
  });
  it('respects precedence and parens', () => {
    expect(parseExpression('(2 + 3) * 4').eval!({})).toBe(20);
    expect(parseExpression('2 ^ 3 ^ 2').eval!({})).toBe(512); // right assoc
  });
  it('handles unary minus', () => {
    expect(parseExpression('-3 + 5').eval!({})).toBe(2);
    expect(parseExpression('2 * -3').eval!({})).toBe(-6);
  });
  it('implicit multiplication', () => {
    const r = parseExpression('2x + 3(x+1)');
    expect(r.ok).toBe(true);
    expect(r.eval!({ x: 2 })).toBe(4 + 9);
  });
  it('functions and constants', () => {
    expect(parseExpression('sqrt(16) + pi').eval!({})).toBeCloseTo(4 + Math.PI, 9);
    expect(parseExpression('ln(e)').eval!({})).toBeCloseTo(1, 9);
    expect(parseExpression('abs(-5)').eval!({})).toBe(5);
  });
  it('collects variables', () => {
    const r = parseExpression('a*x^2 + b*x + c');
    expect(r.vars?.sort()).toEqual(['a', 'b', 'c', 'x']);
  });
  it('reports errors', () => {
    expect(parseExpression('2 +').ok).toBe(false);
    expect(parseExpression('(2+3').ok).toBe(false);
    expect(parseExpression(')').ok).toBe(false);
    expect(parseExpression('').ok).toBe(false);
  });
});

describe('expressionsEquivalent', () => {
  it('confirms equivalent forms', () => {
    expect(expressionsEquivalent('x*x + 2*x', 'x^2 + 2x').equivalent).toBe(true);
    expect(expressionsEquivalent('(x+1)^2', 'x^2 + 2x + 1').equivalent).toBe(true);
    expect(expressionsEquivalent('sqrt(x^2)', 'abs(x)').equivalent).toBe(true);
  });
  it('rejects different expressions', () => {
    const r = expressionsEquivalent('x + 2', 'x + 3');
    expect(r.equivalent).toBe(false);
    expect(r.reason).toMatch(/Different value/);
  });
  it('rejects unparseable input', () => {
    expect(expressionsEquivalent('2 +', '4').equivalent).toBe(false);
  });
  it('flags extra variables', () => {
    const r = expressionsEquivalent('x + y', 'x');
    expect(r.equivalent).toBe(false);
  });
});

describe('numeric + units', () => {
  it('parses values with units', () => {
    expect(parseNumericWithUnit('3.2 m/s^2')).toEqual({ value: 3.2, unit: 'm/s^2' });
    expect(parseNumericWithUnit('-4.5e2')).toEqual({ value: -450, unit: undefined });
    expect(parseNumericWithUnit('abc')).toBeNull();
  });
  it('normalizes units', () => {
    expect(normalizeUnit('m · s^-2')).toBe(normalizeUnit('m*s^-2'));
    expect(normalizeUnit('kg m²/s²')).toBe(normalizeUnit('kg*m^2/s^2'));
  });
  it('tolerance checks', () => {
    expect(nearlyEqual(1.0001, 1.0, 0.001, 0)).toBe(true);
    expect(nearlyEqual(1.01, 1.0, 0.001, 0)).toBe(false);
    expect(nearlyEqual(100.5, 100, 0, 0.01)).toBe(true);
  });
  it('exact normalization', () => {
    expect(normalizeExact('  Hello, World. ')).toBe('hello world');
    expect(normalizeExact('ABC', true)).toBe('ABC');
  });
});
