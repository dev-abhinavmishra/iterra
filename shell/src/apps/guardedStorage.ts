/* localStorage fills up quietly — browsers give ~5MB and a heavy
   semester can reach it. A bare persist write that hits the quota throws
   inside the store mutation: the in-memory update lands but the write is
   lost, and the user finds out at next reload.

   This wrapper mirrors ink's guardedStorage: the write is attempted, a
   failure surfaces ONCE per window (throttled — a quota'd setItem fails
   every keystroke, one toast is enough), and the store never crashes. */
let lastStorageWarning = 0;

export const guardedStorage = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      const now = Date.now();
      if (now - lastStorageWarning > 30_000) {
        lastStorageWarning = now;
        /* bare-window test mocks may not carry dispatchEvent — the notice
           is best-effort, never another throw inside the failed write */
        try {
          window.dispatchEvent(new CustomEvent('iterra:storage-full'));
        } catch { /* no window to notify */ }
      }
    }
  },
  removeItem: (key: string) => localStorage.removeItem(key),
};
