import 'fake-indexeddb/auto';

function makeMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(String(key)) ?? null,
    setItem: (key: string, value: string) => { values.set(String(key), String(value)); },
    removeItem: (key: string) => { values.delete(String(key)); },
    clear: () => { values.clear(); },
  } as Storage;
}

function ensureWritableStorage(name: 'localStorage' | 'sessionStorage') {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  let value: Storage | undefined;
  try { value = (globalThis as typeof globalThis & Record<string, Storage | undefined>)[name]; } catch { /* use memory fallback */ }
  if (!value) value = makeMemoryStorage();
  if (!descriptor || !descriptor.writable) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      enumerable: descriptor?.enumerable ?? true,
      writable: true,
      value,
    });
  }
}

ensureWritableStorage('localStorage');
ensureWritableStorage('sessionStorage');
