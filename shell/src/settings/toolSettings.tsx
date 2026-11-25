import { lazy, Suspense, useMemo, type ComponentType, type LazyExoticComponent } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { PLACE_MAP } from '../places';

type ToolSettingsModule = { default: ComponentType };

/* A deploy landing while the tab is open 404s the old hashed chunks —
   the dynamic import then fails with "Failed to fetch dynamically
   imported module". Retry once for transient fetches; if it still
   fails, reload once so the page picks up the new build instead of
   stranding the user on an error card. The sessionStorage guard keeps
   a still-broken build from reload-looping. */
const CHUNK_RELOAD_KEY = 'iterra:tool-settings-chunk-reload';
const CHUNK_RELOAD_WINDOW_MS = 60_000;

function isChunkLoadError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|ChunkLoadError|Failed to fetch/i.test(msg);
}

function reloadForStaleChunks(): boolean {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
    if (Date.now() - last < CHUNK_RELOAD_WINDOW_MS) return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

function loadSettingsModule(loader: () => Promise<ToolSettingsModule>): Promise<ToolSettingsModule> {
  return loader().catch((error) => {
    if (!isChunkLoadError(error)) throw error;
    return new Promise<ToolSettingsModule>((resolve, reject) => {
      window.setTimeout(() => {
        loader().then(resolve, (retryError) => {
          if (isChunkLoadError(retryError) && reloadForStaleChunks()) {
            /* the page is reloading — stay pending so React.lazy never
               sees a rejection it would cache forever */
            return;
          }
          reject(retryError);
        });
      }, 800);
    });
  });
}

const loaders: Record<string, () => Promise<ToolSettingsModule>> = {
  timer: () => loadSettingsModule(() => import('./toolSettings/timer')),
  ink: () => loadSettingsModule(() => import('./toolSettings/ink')),
  rhythm: () => loadSettingsModule(() => import('./toolSettings/rhythm')),
  proof: () => loadSettingsModule(() => import('./toolSettings/proof')),
  syllabus: () => loadSettingsModule(() => import('./toolSettings/syllabus')),
  gradestack: () => loadSettingsModule(() => import('./toolSettings/gradestack')),
  margin: () => loadSettingsModule(() => import('./toolSettings/margin')),
  flashcards: () => loadSettingsModule(() => import('./toolSettings/flashcards')),
};

const components = new Map<string, LazyExoticComponent<ComponentType>>();

function getToolSettingsComponent(id: string) {
  const loader = loaders[id];
  if (!loader) return undefined;
  let component = components.get(id);
  if (!component) {
    component = lazy(loader);
    components.set(id, component);
  }
  return component;
}

export function hasToolSettings(id: string | null | undefined): id is string {
  return !!id && !!loaders[id];
}

export function ToolSettings({ tool, onBack }: { tool: string; onBack: () => void }) {
  const place = PLACE_MAP[tool];
  const Component = useMemo(() => getToolSettingsComponent(tool), [tool]);

  if (!place || !Component) return null;

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-[5px] border border-[var(--color-line)] bg-[var(--color-sheet)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--color-ink)] hover:border-[var(--color-accent)] cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All tools
        </button>
        <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--color-ink)]">
          <span className="h-4 w-4 text-[var(--color-accent)] [&>svg]:h-full [&>svg]:w-full">
            {place.glyph}
          </span>
          {place.label}
        </div>
      </div>

      <div className="h-[75vh] min-h-[480px] overflow-hidden rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)]">
        <Suspense
          fallback={(
            <div className="flex h-full items-center justify-center gap-2 text-[13px] text-[var(--color-mute)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading {place.label} settings…
            </div>
          )}
        >
          <Component />
        </Suspense>
      </div>
    </div>
  );
}
