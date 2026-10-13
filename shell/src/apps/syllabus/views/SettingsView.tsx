import { useRef, useState } from 'react';
import { useFolio } from '../store';
import { Field, FInput, FSelect } from '../components/Field';
import { Stamp } from '../components/Stamp';
import { Download, Upload, Trash2 } from 'lucide-react';

/**
 * Registry — the folio's own card: app base URLs for deep links, study-window
 * defaults, motion preference, and JSON backup/restore.
 */
export function SettingsView() {
  const s = useFolio();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const doExport = () => {
    const blob = new Blob([s.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `syllabus-folio-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = (file: File) => {
    file.text().then((text) => {
      const res = s.importJSON(text);
      setImportMsg(res.ok ? { ok: true, text: 'Folio restored — every course, plan, and review is back on file.' } : { ok: false, text: res.error });
    });
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="kicker mb-1">REGISTRY</div>
          <h1 className="slab text-[28px] font-semibold leading-none">The folio’s own card</h1>
        </div>
        <Stamp text="LOCAL-FIRST" tone="ink" className="mt-2" />
      </div>

      {/* connected apps */}
      <section className="mb-8" aria-label="Connected apps">
        <div className="hrule kicker mb-4">CONNECTED APPS — DEEP-LINK BASES</div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Timer" hint="Start launches here with intent + minutes + block id">
            <FInput
              className="mono !text-[12px]"
              value={s.settings.timerBaseUrl}
              onChange={(e) => s.updateSettings({ timerBaseUrl: e.target.value })}
            />
          </Field>
          <Field label="Ink">
            <FInput
              className="mono !text-[12px]"
              value={s.settings.inkBaseUrl}
              onChange={(e) => s.updateSettings({ inkBaseUrl: e.target.value })}
            />
          </Field>
          <Field label="Modular AI">
            <FInput
              className="mono !text-[12px]"
              value={s.settings.modularBaseUrl}
              onChange={(e) => s.updateSettings({ modularBaseUrl: e.target.value })}
            />
          </Field>
          <Field label="Flashcards">
            <FInput
              className="mono !text-[12px]"
              value={s.settings.flashcardsBaseUrl}
              onChange={(e) => s.updateSettings({ flashcardsBaseUrl: e.target.value })}
            />
          </Field>
          <Field label="GradeStack">
            <FInput
              className="mono !text-[12px]"
              value={s.settings.gradestackBaseUrl}
              onChange={(e) => s.updateSettings({ gradestackBaseUrl: e.target.value })}
            />
          </Field>
        </div>
      </section>

      {/* planning defaults */}
      <section className="mb-8" aria-label="Planning defaults">
        <div className="hrule kicker mb-4">PLANNING DEFAULTS</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Field label="Study window" hint="first slip starts">
            <FInput
              type="time"
              value={s.settings.studyWindowStart}
              onChange={(e) => s.updateSettings({ studyWindowStart: e.target.value })}
              className="mono"
            />
          </Field>
          <Field label="Max slip" hint="minutes">
            <FInput
              type="number"
              min={30}
              step={15}
              value={s.settings.maxBlockMinutes}
              onChange={(e) => s.updateSettings({ maxBlockMinutes: Math.max(30, Number(e.target.value) || 90) })}
              className="mono"
            />
          </Field>
          <Field label="Default available" hint="min/day">
            <FInput
              type="number"
              min={0}
              step={30}
              value={s.settings.defaultAvailableMinutes}
              onChange={(e) => s.updateSettings({ defaultAvailableMinutes: Math.max(0, Number(e.target.value) || 0) })}
              className="mono"
            />
          </Field>
          <Field label="Week starts">
            <FSelect
              value={s.settings.weekStartsOn}
              onChange={(e) => s.updateSettings({ weekStartsOn: Number(e.target.value) === 0 ? 0 : 1 })}
            >
              <option value={1}>Monday</option>
              <option value={0}>Sunday</option>
            </FSelect>
          </Field>
          <Field label="Motion" hint="full forces motion; reduced honors calm">
            <FSelect
              value={s.settings.motion}
              onChange={(e) => s.updateSettings({ motion: e.target.value === 'reduced' ? 'reduced' : 'full' })}
            >
              <option value="full">Full</option>
              <option value="reduced">Reduced</option>
            </FSelect>
          </Field>
          <Field
            label="Desk reminders"
            hint={
              !('Notification' in window)
                ? 'unsupported in this browser'
                : Notification.permission === 'denied'
                  ? 'blocked — allow in browser settings'
                  : 'one memo on open: what’s due in 48h'
            }
          >
            <button
              type="button"
              className="btn btn--ghost !py-2 !px-3 w-full text-left"
              onClick={async () => {
                if (!('Notification' in window)) return;
                if (!s.settings.remindersEnabled) {
                  const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
                  s.updateSettings({ remindersEnabled: p === 'granted' });
                } else {
                  s.updateSettings({ remindersEnabled: false });
                }
              }}
              aria-pressed={!!s.settings.remindersEnabled}
            >
              {s.settings.remindersEnabled ? '● On — memo at open' : '○ Off'}
            </button>
          </Field>
        </div>
      </section>

      {/* backup / restore */}
      <section className="mb-8" aria-label="Backup and restore">
        <div className="hrule kicker mb-4">BACKUP — THE WHOLE FOLIO AS JSON</div>
        <div className="flex items-center gap-3 flex-wrap">
          <button className="btn inline-flex items-center gap-2" onClick={doExport}>
            <Download size={13} /> Export folio
          </button>
          <button className="btn btn--ghost inline-flex items-center gap-2" onClick={() => fileRef.current?.click()}>
            <Upload size={13} /> Restore folio
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) doImport(f);
              e.target.value = '';
            }}
          />
          {importMsg && (
            <span className={importMsg.ok ? 'mono text-[11px] text-[color:var(--color-ok)]' : 'mono text-[11px] text-[color:var(--color-late)]'}>
              {importMsg.text}
            </span>
          )}
        </div>
        <p className="text-[12px] text-[color:var(--color-ink-faint)] mt-2 max-w-lg">
          Everything lives in this browser — no sign-in, no server. The export fully
          restores courses, commitments, blocks, links, and reviews into any other folio.
        </p>
      </section>

      {/* danger */}
      <section aria-label="Reset">
        <div className="hrule kicker mb-4 !text-[color:var(--color-late)]">STRIKE THE LEDGER</div>
        {!confirmReset ? (
          <button className="btn btn--ghost !text-[color:var(--color-late)] !border-[color:var(--color-late)] inline-flex items-center gap-2" onClick={() => setConfirmReset(true)}>
            <Trash2 size={13} /> Reset the folio
          </button>
        ) : (
          <div className="slip pl-4 pr-3 py-3 flex items-center gap-3">
            <p className="text-[12.5px] flex-1">
              Strikes every course, commitment, slip, and review. Export first if the record matters.
            </p>
            <button className="btn btn--late" onClick={() => { s.resetFolio(); setConfirmReset(false); }}>
              Strike it
            </button>
            <button className="btn btn--ghost" onClick={() => setConfirmReset(false)}>Keep</button>
          </div>
        )}
      </section>
    </div>
  );
}
