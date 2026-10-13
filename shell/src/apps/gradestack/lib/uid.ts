/** crypto.randomUUID throws on non-secure contexts (plain http://), which
    white-screens whole pages — fall back to Math.random there. */
export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
