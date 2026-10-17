import React, { useMemo } from 'react';
import { useStore } from '../../store';
import { activityByDay, currentStreak, todayKey } from '../../lib/notes';
import { useNow } from '../../lib/useNow';
import { useNavigate } from 'react-router-dom';
import { Flame, BookText, PenLine, Folder } from 'lucide-react';
import { InkBlot } from '../../lib/ink';
import { penOf } from '../../lib/pens';

const WEEKS = 16;

/* How wet a day ran — mapped to blot opacity, not square color. */
const density = (count: number) =>
  count === 0 ? 0
  : count === 1 ? 0.3
  : count <= 3 ? 0.5
  : count <= 6 ? 0.72
  : 0.95;

export const OrganizationInsights: React.FC = () => {
  const { notes, setActiveNote, setActiveFolder } = useStore();
  const navigate = useNavigate();
  const now = useNow();
  const live = useMemo(() => notes.filter(n => !n.trashedAt), [notes]);

  const { weeks, streak, totalWords } = useMemo(() => {
    const days = activityByDay(live);
    const end = new Date(now);
    const start = new Date(end);
    start.setDate(end.getDate() - (end.getDay() + 7 * (WEEKS - 1)));
    const columns: { key: string; count: number; label: string }[][] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const col: { key: string; count: number; label: string }[] = [];
      for (let d = 0; d < 7 && cursor <= end; d++) {
        const key = todayKey(cursor);
        col.push({
          key,
          count: days.get(key) ?? 0,
          label: cursor.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      columns.push(col);
    }
    return {
      weeks: columns,
      streak: currentStreak(days),
      totalWords: live.reduce((sum, note) => sum + note.wordCount, 0),
    };
  }, [live, now]);

  const longest = useMemo(
    () => [...live].sort((a, b) => b.wordCount - a.wordCount).slice(0, 5),
    [live]
  );
  const weekNotes = live.filter(n => now - n.createdAt < 7 * 24 * 3600 * 1000).length;
  const folders = useMemo(() => {
    const map = new Map<string, number>();
    live.forEach(n => map.set(n.folder, (map.get(n.folder) ?? 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [live]);
  const maxFolder = Math.max(1, ...folders.map(([, count]) => count));

  return (
    <div className="flex-1 overflow-y-auto bg-desk custom-scrollbar">
      <div className="max-w-5xl mx-auto px-6 md:px-10 py-10 md:py-14 pb-28">
        <div className="mb-10">
          <h1 className="font-serif text-3xl font-semibold text-ink tracking-tight">The logbook</h1>
          <p className="text-sm text-ink-faint mt-1.5 max-w-md">
            How the writing is going — counted honestly from what's on this desk.
          </p>
        </div>

        {/* Ledger row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-10">
          <Stat icon={<Flame className="w-4 h-4 text-pencil" strokeWidth={1.75} />} label="Writing streak" value={`${streak} ${streak === 1 ? 'day' : 'days'}`} />
          <Stat icon={<PenLine className="w-4 h-4 text-ink-faint" strokeWidth={1.75} />} label="Words kept" value={totalWords.toLocaleString()} />
          <Stat icon={<BookText className="w-4 h-4 text-ink-faint" strokeWidth={1.75} />} label="Pages" value={String(live.length)} />
          <Stat icon={<Folder className="w-4 h-4 text-manila" strokeWidth={1.75} />} label="New this week" value={String(weekNotes)} />
        </div>

        {/* The habit grid */}
        <section className="bg-paper border border-line rounded p-6 mb-10 overflow-x-auto custom-scrollbar">
          <div className="flex items-baseline justify-between mb-5 min-w-[560px]">
            <h2 className="font-serif text-lg font-semibold text-ink">Ink on the page</h2>
            <p className="font-mono text-2xs text-ink-ghost">each blot is a day a page was written or touched</p>
          </div>
          <div className="flex gap-[3px] min-w-[560px]">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px] flex-1">
                {week.map(day => (
                  <div
                    key={day.key}
                    title={`${day.label} — ${day.count} ${day.count === 1 ? 'note' : 'notes'} touched`}
                    className="w-full aspect-square flex items-center justify-center"
                  >
                    {day.count === 0 ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-line/70" />
                    ) : (
                      <InkBlot seed={`day:${day.key}`} size={13} satellites={0} color="var(--color-pencil)" opacity={density(day.count)} />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-end gap-1.5 mt-4 min-w-[560px]">
            <span className="font-mono text-2xs text-ink-ghost mr-1">quiet</span>
            {[1, 3, 5, 8].map(n => (
              <InkBlot key={n} seed={`legend:${n}`} size={11} satellites={0} color="var(--color-pencil)" opacity={density(n)} />
            ))}
            <span className="font-mono text-2xs text-ink-ghost ml-1">busy</span>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Longest pages */}
          <section className="lg:col-span-7">
            <h2 className="font-serif text-lg font-semibold text-ink mb-3">The longest pages</h2>
            <div className="bg-paper border border-line rounded divide-y divide-line overflow-hidden">
              {longest.length === 0 && (
                <p className="p-6 text-sm text-ink-faint font-serif">Nothing written yet.</p>
              )}
              {longest.map((note, i) => (
                <button
                  key={note.id}
                  onClick={() => { setActiveNote(note.id); navigate('/'); }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-paper-dim/60 transition-colors text-left"
                >
                  <span className="font-mono text-2xs text-ink-ghost w-5 text-right flex-shrink-0">{i + 1}</span>
                  <InkBlot seed={note.id} size={13} satellites={0} color={penOf(note.ink).color} opacity={0.7} className="flex-shrink-0" />
                  <span className="flex-1 font-serif text-[14px] text-ink truncate">{note.title || 'Untitled'}</span>
                  <span className="font-mono text-2xs text-ink-ghost tabular-nums flex-shrink-0">{note.wordCount.toLocaleString()} words</span>
                </button>
              ))}
            </div>
          </section>

          {/* Where things live */}
          <section className="lg:col-span-5">
            <h2 className="font-serif text-lg font-semibold text-ink mb-3">Where things live</h2>
            <div className="space-y-3">
              {folders.map(([folder, count]) => (
                <button
                  key={folder}
                  onClick={() => { setActiveFolder(folder); navigate('/'); }}
                  className="w-full text-left group"
                >
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-[13px] font-medium text-ink group-hover:text-fountain transition-colors">{folder}</span>
                    <span className="font-mono text-2xs text-ink-ghost tabular-nums">{count}</span>
                  </div>
                  <div className="h-[3px] w-full bg-line/50 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-manila rounded-full transition-all duration-500"
                      style={{ width: `${(count / maxFolder) * 100}%` }}
                    />
                  </div>
                </button>
              ))}
            </div>
            <p className="font-mono text-2xs text-ink-ghost mt-6 leading-relaxed">
              Counted {todayKey()} · local library, nothing leaves this desk.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

const Stat = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="bg-paper border border-line rounded px-4 py-4">
    <div className="flex items-center gap-2 mb-2">
      {icon}
      <p className="text-2xs font-medium text-ink-ghost">{label}</p>
    </div>
    <p className="font-serif text-[26px] font-semibold text-ink leading-none">{value}</p>
  </div>
);
