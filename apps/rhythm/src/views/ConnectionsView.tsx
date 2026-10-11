// ── Connections — the automation desk ────────────────────────────────────────
// Events arrive normalized, are deduplicated by id, stay attributable to their
// source app, and can be removed together with that source — derived entries
// leave with them; hand-written lines never do.

import { useMemo, useState } from 'react';
import { useRegister } from '../store';
import type { RoutineEvent, SuiteApp } from '../lib/types';
import { KNOWN_APPS, KNOWN_EVENT_TYPES, summarizeEvent } from '../lib/events';
import { APP_DISPLAY, appBaseUrl, evidenceUrl } from '../lib/links';
import { dateOfInstant, fmtDay } from '../lib/dates';
import { Field } from '../components/Field';
import { Sheet } from '../components/Sheet';
import { cx } from '../lib/utils';
import { parseEventsJSON } from '../lib/import';

export function ConnectionsView() {
  const s = useRegister();
  const [pasteOpen, setPasteOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [confirmSource, setConfirmSource] = useState<SuiteApp | null>(null);

  const events = Object.values(s.events).sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1));
  const mappings = Object.values(s.mappings);
  const bySource = useMemo(() => {
    const m = new Map<SuiteApp, RoutineEvent[]>();
    for (const e of events) {
      const arr = m.get(e.sourceApp) ?? [];
      arr.push(e);
      m.set(e.sourceApp, arr);
    }
    return m;
  }, [events]);

  const eventTypes = useMemo(() => {
    const t = new Set<string>(KNOWN_EVENT_TYPES as readonly string[]);
    for (const e of events) t.add(e.type);
    for (const m of mappings) t.add(m.eventType);
    return [...t].sort();
  }, [events, mappings]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker mb-1">Connections</div>
          <h1 className="datestamp text-2xl">Where events come from</h1>
          <p className="mt-1 max-w-xl text-[12.5px] leading-snug text-ink-soft">
            Rhythm listens, it doesn't reach in. Another app can push one normalized event at a
            time through the register's <span className="mono">?event=</span> link, or you can file
            a JSON export below. Nothing here is required — the register stands on its own.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn--quiet" onClick={() => setMapOpen(true)} disabled={Object.keys(s.routines).filter((id) => s.routines[id].status !== 'archived').length === 0}>
            New mapping
          </button>
          <button className="btn btn--primary" onClick={() => setPasteOpen(true)}>
            File an event
          </button>
        </div>
      </div>

      {/* ── Sources ──────────────────────────────────────────────── */}
      <section className="mb-6" aria-label="sources">
        <div className="kicker mb-2">Sources</div>
        <div className="border-y border-rule">
          {KNOWN_APPS.map((app) => {
            const evs = bySource.get(app) ?? [];
            const base = appBaseUrl(app, s.settings);
            const last = evs[0];
            return (
              <div key={app} className="lrow flex items-center gap-3 px-2 py-2">
                <span className="datestamp w-24 text-[13.5px]">{APP_DISPLAY[app]}</span>
                <span className="mono flex-1 text-[11px] text-ink-soft">
                  {evs.length === 0
                    ? 'no events received'
                    : `${evs.length} event${evs.length === 1 ? '' : 's'} · last ${fmtDay(dateOfInstant(last.receivedAt))}`}
                </span>
                {base && (
                  <a className="mono text-[10px] uppercase text-indigo underline" href={base} target="_blank" rel="noreferrer">
                    open
                  </a>
                )}
                {evs.length > 0 && (
                  <button className="btn btn--danger !px-2 !py-0.5 text-[9.5px]" onClick={() => setConfirmSource(app)}>
                    remove
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-2 max-w-xl text-[11px] leading-snug text-ink-faint">
          Removing a source deletes its events and every entry they wrote — reversibility is the
          contract. Lines you wrote yourself always stay.
        </p>
      </section>

      {/* ── Mappings ─────────────────────────────────────────────── */}
      <section className="mb-6" aria-label="mappings">
        <div className="kicker mb-2">Mappings — which events stamp which lines</div>
        {mappings.length === 0 ? (
          <p className="py-3 text-[12.5px] text-ink-faint">
            No mappings yet. A mapping says: "when a{' '}
            <span className="mono">timer.session.completed</span> event arrives, stamp Focus
            session."
          </p>
        ) : (
          <div className="border-y border-rule">
            {mappings.map((m) => {
              const r = s.routines[m.routineId];
              const covered = events.filter((e) => m.eventType === e.type || (m.eventType.endsWith('.*') && e.type.startsWith(m.eventType.slice(0, -1))));
              return (
                <div key={m.id} className="lrow flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-2">
                  <span className="mono text-[11.5px]">{m.eventType}</span>
                  <span className="text-ink-faint">→</span>
                  <span className="datestamp text-[13px]">{r?.name ?? '(removed routine)'}</span>
                  <span className="mono text-[10px] uppercase text-ink-faint">
                    {m.valueRule}
                    {m.metricKey ? `:${m.metricKey}` : ''} · {covered.length} events
                  </span>
                  <span className="flex-1" />
                  <button
                    className={cx('btn btn--quiet !px-2 !py-0.5 text-[9.5px]', !m.enabled && 'opacity-60')}
                    onClick={() => s.updateMapping(m.id, { enabled: !m.enabled })}
                  >
                    {m.enabled ? 'on' : 'off'}
                  </button>
                  <button className="mono text-[10px] uppercase text-ink-faint underline" onClick={() => s.removeMapping(m.id)}>
                    revoke
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Event ledger ─────────────────────────────────────────── */}
      <section aria-label="event ledger">
        <div className="kicker mb-2">Received — the intake ledger</div>
        {events.length === 0 ? (
          <p className="py-3 text-[12.5px] text-ink-faint">No events yet. File one to see the intake.</p>
        ) : (
          <div className="border-y border-rule">
            {events.slice(0, 20).map((e) => {
              const url = evidenceUrl(e, s.settings);
              const written = Object.values(s.entries).filter((en) => en.eventId === e.id).length;
              return (
                <div key={e.id} className="lrow flex flex-wrap items-center gap-x-3 gap-y-0.5 px-2 py-2">
                  <span className="mono text-[10px] uppercase text-ink-faint">{APP_DISPLAY[e.sourceApp]}</span>
                  <span className="mono text-[11.5px]">
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer" className="text-indigo underline">
                        {e.type}
                      </a>
                    ) : (
                      e.type
                    )}
                  </span>
                  <span className="mono text-[10.5px] text-ink-soft">{summarizeEvent(e)}</span>
                  <span className="flex-1" />
                  <span className="mono text-[10px] text-ink-faint">
                    {fmtDay(dateOfInstant(e.occurredAt))} · {written ? `${written} entr${written === 1 ? 'y' : 'ies'}` : 'unmapped'}
                  </span>
                  <button className="mono text-[10px] uppercase text-ink-faint underline" onClick={() => s.removeEvent(e.id)}>
                    strike
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {pasteOpen && <IntakeSheet onClose={() => setPasteOpen(false)} />}
      {mapOpen && <MappingSheet eventTypes={eventTypes} onClose={() => setMapOpen(false)} />}
      {confirmSource && (
        <ConfirmSourceSheet
          app={confirmSource}
          onClose={() => setConfirmSource(null)}
        />
      )}
    </div>
  );
}

// ── File an event — paste or upload JSON ─────────────────────────────────────

function IntakeSheet({ onClose }: { onClose: () => void }) {
  const intakeRaw = useRegister((s) => s.intakeRaw);
  const routines = useRegister((s) => s.routines);
  const [text, setText] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [rows, setRows] = useState<{ label: string; state: string }[]>([]);

  const file = (payloads: unknown[]) => {
    const out: { label: string; state: string }[] = [];
    let okCount = 0;
    for (const raw of payloads) {
      const res = intakeRaw(raw);
      const id = typeof raw === 'object' && raw !== null ? String((raw as Record<string, unknown>).id ?? '?') : '?';
      if (res.kind === 'accepted') {
        okCount++;
        const names = res.entries.map((e) => routines[e.routineId]?.name).filter(Boolean).join(', ');
        out.push({ label: `${res.event.type} (${id})`, state: `stamped → ${names || 'routine'}` });
      } else if (res.kind === 'duplicate') {
        out.push({ label: `${res.event.type} (${id})`, state: 'duplicate — already on file' });
      } else if (res.kind === 'unmapped') {
        okCount++;
        out.push({ label: `${res.event.type} (${id})`, state: 'stored — no mapping covers it yet' });
      } else {
        out.push({ label: id, state: `rejected — ${res.error}` });
      }
    }
    setRows(out);
    setResult(`${okCount} event${okCount === 1 ? '' : 's'} filed into the register.`);
  };

  return (
    <Sheet title="File events into the register" onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-[12px] leading-snug text-ink-soft">
          Paste one event, an array, or a document with an <span className="mono">"events"</span>{' '}
          field — the same normalized shape suite apps emit:{' '}
          <span className="mono text-[10.5px]">
            {'{"id","type","occurredAt","sourceApp","durationSeconds","metrics"}'}
          </span>
        </p>
        <Field label="Event JSON">
          <textarea
            className="f-textarea mono !text-[11.5px]"
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='{"id":"evt_1","type":"timer.session.completed","occurredAt":"2026-10-10T20:00:00-05:00","sourceApp":"timer","durationSeconds":1500}'
            autoFocus
          />
        </Field>
        {result && <p className="text-[12.5px] text-indigo">{result}</p>}
        {rows.length > 0 && (
          <div className="max-h-40 overflow-y-auto border-y border-rule">
            {rows.map((r, i) => (
              <div key={i} className="lrow flex justify-between gap-3 px-1 py-1 mono text-[10.5px]">
                <span className="truncate">{r.label}</span>
                <span className="text-ink-soft">{r.state}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn--quiet" onClick={onClose}>
            Close
          </button>
          <FileButton onParse={file} text={text} setResult={setResult} />
        </div>
      </div>
    </Sheet>
  );
}

function FileButton({
  onParse,
  text,
  setResult,
}: {
  onParse: (payloads: unknown[]) => void;
  text: string;
  setResult: (r: string | null) => void;
}) {
  return (
    <>
      <label className="btn btn--quiet cursor-pointer">
        From file…
        <input
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const t = await f.text();
            const batch = parseEventsJSON(t);
            if ('error' in batch) {
              setResult(`Couldn't read that file: ${batch.error}`);
              return;
            }
            onParse(batch.events);
          }}
        />
      </label>
      <button
        type="button"
        className="btn btn--primary"
        disabled={!text.trim()}
        onClick={() => {
          const batch = parseEventsJSON(text);
          if ('error' in batch) {
            setResult(`Couldn't read that: ${batch.error}`);
            return;
          }
          onParse(batch.events);
        }}
      >
        File events
      </button>
    </>
  );
}

// ── New mapping ──────────────────────────────────────────────────────────────

function MappingSheet({ eventTypes, onClose }: { eventTypes: string[]; onClose: () => void }) {
  const s = useRegister();
  const routines = Object.values(s.routines).filter((r) => r.status !== 'archived');
  const [eventType, setEventType] = useState(eventTypes[0] ?? '');
  const [custom, setCustom] = useState('');
  const [routineId, setRoutineId] = useState(routines[0]?.id ?? '');
  const [valueRule, setValueRule] = useState<'presence' | 'duration' | 'metric'>('presence');
  const [metricKey, setMetricKey] = useState('');
  const [preview, setPreview] = useState<string | null>(null);

  const type = custom.trim() || eventType;

  const previewIt = () => {
    const r = routines.find((x) => x.id === routineId);
    if (!r) return;
    const stored = Object.values(s.events).filter(
      (e) => e.type === type || (type.endsWith('.*') && e.type.startsWith(type.slice(0, -1))),
    );
    const wouldMap = stored.filter((e) => {
      if (valueRule === 'duration') return !!e.durationSeconds;
      if (valueRule === 'metric') return metricKey && e.metrics?.[metricKey] !== undefined;
      return true;
    });
    setPreview(
      `${stored.length} stored event${stored.length === 1 ? '' : 's'} of type "${type}" — ` +
        `${wouldMap.length} would stamp "${r.name}" under this rule.`,
    );
  };

  return (
    <Sheet title="Map events to a routine" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!type || !routineId) return;
          s.addMapping({ eventType: type, routineId, valueRule, metricKey: valueRule === 'metric' ? metricKey : undefined });
          onClose();
        }}
      >
        <Field label="Event type" hint="exact type, or a wildcard like timer.*">
          <select className="f-select" value={eventType} onChange={(e) => setEventType(e.target.value)}>
            {eventTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            <option value="">custom…</option>
          </select>
        </Field>
        {eventType === '' && (
          <Field label="Custom type">
            <input className="f-input mono" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="app.something.happened" />
          </Field>
        )}
        <Field label="Stamps routine">
          <select className="f-select" value={routineId} onChange={(e) => setRoutineId(e.target.value)}>
            {routines.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Value it writes">
          <select className="f-select" value={valueRule} onChange={(e) => setValueRule(e.target.value as never)}>
            <option value="presence">presence — marks the line done</option>
            <option value="duration">duration — writes its minutes</option>
            <option value="metric">a metric — picks one number</option>
          </select>
        </Field>
        {valueRule === 'metric' && (
          <Field label="Metric key">
            <input className="f-input mono" value={metricKey} onChange={(e) => setMetricKey(e.target.value)} placeholder="e.g. reviewed, correct, pages" />
          </Field>
        )}
        {preview && <p className="text-[12px] text-ink-soft">{preview}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn--quiet" onClick={previewIt}>
            Preview
          </button>
          <button type="submit" className="btn btn--primary" disabled={!type || !routineId || (valueRule === 'metric' && !metricKey.trim())}>
            Map it
          </button>
        </div>
      </form>
    </Sheet>
  );
}

// ── Remove a source ──────────────────────────────────────────────────────────

function ConfirmSourceSheet({ app, onClose }: { app: SuiteApp; onClose: () => void }) {
  const s = useRegister();
  const count = Object.values(s.events).filter((e) => e.sourceApp === app).length;
  const derived = Object.values(s.entries).filter((en) => {
    const ev = en.eventId ? s.events[en.eventId] : undefined;
    return ev?.sourceApp === app;
  }).length;

  return (
    <Sheet title={`Remove ${APP_DISPLAY[app]} events`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-[13px] leading-snug">
          This strikes <b>{count}</b> event{count === 1 ? '' : 's'} and the{' '}
          <b>{derived}</b> entr{derived === 1 ? 'y' : 'ies'} they wrote. Lines you wrote yourself
          stay. The source can send again later — the register doesn't hold a grudge.
        </p>
        <div className="flex justify-end gap-2">
          <button className="btn btn--quiet" onClick={onClose}>
            Keep them
          </button>
          <button
            className="btn btn--danger"
            onClick={() => {
              s.deleteEventsBySource(app);
              onClose();
            }}
          >
            Remove source
          </button>
        </div>
      </div>
    </Sheet>
  );
}
