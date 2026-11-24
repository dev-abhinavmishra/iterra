import { lazy, Suspense, useMemo, type ComponentType, type LazyExoticComponent } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { PLACE_MAP } from '../places';

type ToolSettingsModule = { default: ComponentType };

const loaders: Record<string, () => Promise<ToolSettingsModule>> = {
  timer: () => import('./toolSettings/timer'),
  ink: () => import('./toolSettings/ink'),
  rhythm: () => import('./toolSettings/rhythm'),
  proof: () => import('./toolSettings/proof'),
  syllabus: () => import('./toolSettings/syllabus'),
  gradestack: () => import('./toolSettings/gradestack'),
  margin: () => import('./toolSettings/margin'),
  flashcards: () => import('./toolSettings/flashcards'),
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
