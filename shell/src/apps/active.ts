/** Keep-alive places stay mounted while hidden — their window-level key
 *  listeners must no-op unless the place is the one in front. Standalone
 *  (non-integrated) usage always passes. */
export function placeActive(app: string): boolean {
  const w = window as any;
  if (!w.__iterraIntegrated) return true;
  return w.iterra?.active?.() === app;
}
