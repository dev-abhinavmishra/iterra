import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWorkbench } from '../store';
import { openDeep } from '../lib/iterra';
import {
  unaidedSuccess, hintLevelSuccess, calibration, calibrationGap,
  errorRecurrence, retrySuccessAfterDelay, topicCoverage, totals,
} from '../lib/metrics';
import { fmtDate, fmtMinutes } from '../lib/utils';
import { HINT_LABELS } from '../components/ProofRail';
import type { HintLevel } from '../lib/types';

/** Progress — skill, not vanity. No single mastery number exists here. */
export function ProgressView() {
  const problems = useWorkbench(useShallow((s) => Object.values(s.problems)));
  const attempts = useWorkbench(useShallow((s) => Object.values(s.attempts)));
  const errors = useWorkbench(useShallow((s) => Object.values(s.errors)));
  const reviews = useWorkbench((s) => s.reviews);

  const t = totals(attempts, problems);
  const unaided = unaidedSuccess(attempts);
  const hints = hintLevelSuccess(attempts);
  const cal = calibration(attempts);
  const gap = calibrationGap(attempts);
  const rec = errorRecurrence(errors);
  const retry = retrySuccessAfterDelay(attempts, reviews);
  const coverage = topicCoverage(problems, attempts);

  const pct = (r: number | null) => (r == null ? '—' : `${Math.round(r * 100)}%`);
  const dueByTopic = useDueCardsByTopic(coverage.map((c) => c.topic));

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <div className="pad mt-3 p-5">
        <div className="kicker">progress — measured separately, never averaged into one number</div>
        <p className="mb-4 mt-1 text-[13px] text-[var(--color-ink-soft)]">
          Accurate but hint-dependent, confident but miscalibrated, strong blocked and weak mixed —
          each is a different problem. The sheet shows them apart.
        </p>

        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="graded attempts" value={String(t.attempts)} />
          <Stat label="problems in bank" value={String(t.problems)} sub={`${t.attemptedProblems} attempted`} />
          <Stat label="avg attempt" value={t.avgMinutes == null ? '—' : fmtMinutes(t.avgMinutes)} />
          <Stat
            label="calibration"
            value={gap == null ? '—' : gap > 0.05 ? `overconfident +${Math.round(gap * 100)}%` : gap < -0.05 ? `underconfident ${Math.round(gap * 100)}%` : 'well calibrated'}
            sub="predicted vs actual"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="film rounded p-4">
            <div className="kicker mb-2">unaided success — the number that counts</div>
            <table className="met-table">
              <thead><tr><th>measure</th><th>hits</th><th>of</th><th>rate</th></tr></thead>
              <tbody>
                <tr>
                  <td>correct with no hints</td>
                  <td className="mono">{unaided.hits}</td>
                  <td className="mono">{unaided.of}</td>
                  <td className="mono">{pct(unaided.rate)}</td>
                </tr>
                <tr>
                  <td>retries after delay</td>
                  <td className="mono">{retry.hits}</td>
                  <td className="mono">{retry.of}</td>
                  <td className="mono">{pct(retry.rate)}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="film rounded p-4">
            <div className="kicker mb-2">success after hints — by deepest level used</div>
            <table className="met-table">
              <thead><tr><th>ladder level</th><th>hits</th><th>of</th><th>rate</th></tr></thead>
              <tbody>
                {hints.map((h) => (
                  <tr key={h.level}>
                    <td>{h.level} — {HINT_LABELS[h.level as HintLevel]}</td>
                    <td className="mono">{h.hits}</td>
                    <td className="mono">{h.of}</td>
                    <td className="mono">{h.of ? pct(h.hits / h.of) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="film rounded p-4">
            <div className="kicker mb-2">confidence calibration — predicted vs actual</div>
            <table className="met-table">
              <thead><tr><th>said</th><th>meant</th><th>hits</th><th>of</th><th>actual</th></tr></thead>
              <tbody>
                {cal.map((c) => (
                  <tr key={c.confidence} className={c.rate != null && c.rate < c.confidence / 5 - 0.25 ? 'text-[var(--color-correct-deep)]' : ''}>
                    <td className="mono">{c.confidence}/5</td>
                    <td className="text-[11px] text-[var(--color-ink-soft)]">
                      {['', 'guessing', 'unsure', 'maybe', 'fairly sure', 'certain'][c.confidence]}
                    </td>
                    <td className="mono">{c.hits}</td>
                    <td className="mono">{c.of}</td>
                    <td className="mono">{pct(c.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="film rounded p-4">
            <div className="kicker mb-2">error recurrence — where the ledger concentrates</div>
            <table className="met-table">
              <thead><tr><th>category</th><th>count</th><th>latest</th><th></th></tr></thead>
              <tbody>
                {rec.map((r) => (
                  <tr key={r.category}>
                    <td>{r.category.replace('custom:', 'custom — ')}</td>
                    <td className="mono">{r.count}</td>
                    <td className="mono">{fmtDate(r.latest)}</td>
                    <td className="w-24"><div className="meter meter--violet"><i style={{ width: `${(r.count / (rec[0]?.count || 1)) * 100}%` }} /></div></td>
                  </tr>
                ))}
                {!rec.length && <tr><td colSpan={4} className="text-[12px] text-[var(--color-ink-faint)]">no errors filed yet</td></tr>}
              </tbody>
            </table>
          </section>
        </div>

        <section className="film mt-4 rounded p-4">
          <div className="kicker mb-2">topic coverage — attempted share and unaided rate</div>
          <table className="met-table">
            <thead><tr><th>topic</th><th>attempted</th><th>coverage</th><th>unaided rate</th><th>due cards</th></tr></thead>
            <tbody>
              {coverage.map((c) => (
                <tr key={c.topic}>
                  <td>{c.topic}</td>
                  <td className="mono">{c.attempted}/{c.total}</td>
                  <td className="w-40"><div className="meter"><i style={{ width: `${c.total ? (c.attempted / c.total) * 100 : 0}%` }} /></div></td>
                  <td className="mono">{pct(c.unaidedRate)}</td>
                  <td>
                    {dueByTopic[c.topic] ? (
                      <button
                        className="chip chip--violet"
                        title={`${dueByTopic[c.topic]} flashcard${dueByTopic[c.topic] === 1 ? '' : 's'} due on ${c.topic}`}
                        onClick={() => openDeep('/apps/flashcards/')}
                      >
                        {dueByTopic[c.topic]} due →
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!coverage.length && <tr><td colSpan={5} className="text-[12px] text-[var(--color-ink-faint)]">no topics yet</td></tr>}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

/* iterra bridge — due flashcards per topic (docs/ADAPTER.md):
   store.list({app:'flashcards'}) filtered by topic/title/course/deck-name
   match rides to the deck app. Guarded — standalone shows nothing. */
function useDueCardsByTopic(topics: string[]): Record<string, number> {
  const [due, setDue] = useState<Record<string, number>>({});
  useEffect(() => {
    let live = true;
    setDue({});
    const it = (window as any).iterra;
    if (!it?.store?.list || !topics.length) return;
    const norm = (s: unknown) => String(s ?? '').toLowerCase().trim();
    (async () => {
      const [cards, decks] = await Promise.all([
        it.store.list({ app: 'flashcards', type: 'card' }).catch(() => []),
        it.store.list({ app: 'flashcards', type: 'deck' }).catch(() => []),
      ]);
      if (!live) return;
      const deckTitle = new Map((decks || []).map((d: any) => [d.id, norm(d.title)]));
      const counts: Record<string, number> = {};
      const now = Date.now();
      for (const c of cards || []) {
        const dueAt = c?.data?.dueAt;
        if (dueAt == null || dueAt > now) continue;
        const hay = [norm(c.data?.topic), norm(c.title), norm(c.sub), norm(c.course), deckTitle.get(c.data?.deckId) || ''].join(' | ');
        for (const t of topics) {
          const nt = norm(t);
          if (nt && hay.includes(nt)) { counts[t] = (counts[t] || 0) + 1; break; }
        }
      }
      if (live) setDue(counts);
    })();
    return () => {
      live = false;
    };
  }, [topics.join('|')]);
  return due;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="film rounded p-3">
      <div className="kicker !text-[9px]">{label}</div>
      <div className="mono mt-1 text-[18px] font-semibold text-[var(--color-ink)]">{value}</div>
      {sub && <div className="text-[10.5px] text-[var(--color-ink-faint)]">{sub}</div>}
    </div>
  );
}
