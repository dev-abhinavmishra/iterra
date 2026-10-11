import { useState, useRef } from 'react';
import { useStore } from '../store';
import { Icon, Button, Input, Toggle, PageHeader, Bubble } from '../components/ui';
import { GradingScale, downloadFile, DEFAULT_SCALE } from '../lib/grading';
import { firebaseEnabled, signInWithGoogle, logOut, describeAuthError } from '../lib/firebase';

const SCALE_ROWS: Array<{ letter: keyof GradingScale; hint: string }> = [
  { letter: 'A', hint: 'excellent' },
  { letter: 'B', hint: 'good' },
  { letter: 'C', hint: 'satisfactory' },
  { letter: 'D', hint: 'passing' },
];

export function Settings() {
  const theme = useStore(s => s.theme);
  const setTheme = useStore(s => s.setTheme);
  const gradingScale = useStore(s => s.gradingScale);
  const setGradingScale = useStore(s => s.setGradingScale);
  const partialCredit = useStore(s => s.partialCredit);
  const setPartialCredit = useStore(s => s.setPartialCredit);
  const geminiKey = useStore(s => s.geminiKey);
  const setGeminiKey = useStore(s => s.setGeminiKey);
  const regradeAll = useStore(s => s.regradeAll);
  const exportData = useStore(s => s.exportData);
  const importData = useStore(s => s.importData);
  const clearAllData = useStore(s => s.clearAllData);
  const tests = useStore(s => s.tests);
  const scans = useStore(s => s.scans);
  const user = useStore(s => s.user);

  const [scaleDraft, setScaleDraft] = useState<GradingScale>({ ...gradingScale });
  const [scaleDirty, setScaleDirty] = useState(false);
  const [keyDraft, setKeyDraft] = useState(geminiKey);
  const [keyDirty, setKeyDirty] = useState(false);
  const [regrading, setRegrading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 3200);
  };

  const saveScale = async () => {
    const ordered = [...SCALE_ROWS].map(r => scaleDraft[r.letter]);
    const valid = ordered.every((v, i) => typeof v === 'number' && !isNaN(v) && v >= 0 && v <= 100 && (i === 0 || v <= ordered[i - 1]));
    if (!valid) {
      flash('Cutoffs must descend A ≥ B ≥ C ≥ D, between 0 and 100.');
      return;
    }
    setGradingScale({ ...scaleDraft });
    setScaleDirty(false);
    setRegrading(true);
    await regradeAll();
    setRegrading(false);
    flash('Scale saved — every stored sheet re-graded.');
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const n = importData(text);
      flash(`Imported ${n} new item${n === 1 ? '' : 's'}.`);
    } catch {
      flash("That file isn't a GradeStack backup.");
    }
  };

  const handleSignIn = async () => {
    setSignInError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setSignInError(describeAuthError(e));
    }
  };

  const handleReset = async () => {
    await clearAllData();
    setConfirmReset(false);
    flash('Everything cleared.');
  };

  const themes: Array<{ id: 'light' | 'dark' | 'system'; label: string; icon: string }> = [
    { id: 'light', label: 'Paper', icon: 'light_mode' },
    { id: 'dark', label: 'Ink', icon: 'dark_mode' },
    { id: 'system', label: 'System', icon: 'contrast' },
  ];

  return (
    <div className="p-6 lg:p-10 max-w-3xl mx-auto w-full flex-1">
      <PageHeader title="Settings" description="Grading rules, reader key, and your data." />

      {notice && (
        <div className="doc-raised border-mark/30 bg-mark-mist-2 px-4 py-3 mb-6 flex items-center gap-2.5">
          <Icon name="check_circle" size={17} className="text-mark-deep" />
          <span className="text-sm font-medium text-ink">{notice}</span>
        </div>
      )}

      {/* Appearance — pick a bubble, like marking a sheet */}
      <section className="doc p-6 mb-6">
        <h2 className="font-display text-lg font-semibold mb-1">Appearance</h2>
        <p className="text-sm text-pencil mb-5">Fill one bubble.</p>
        <div className="flex gap-6">
          {themes.map(t => (
            <div key={t.id} className="flex flex-col items-center gap-2">
              <Bubble filled={theme === t.id} size={30} onClick={() => setTheme(t.id)} title={t.label} />
              <button
                onClick={() => setTheme(t.id)}
                className={`text-xs font-semibold flex items-center gap-1 transition-colors ${theme === t.id ? 'text-ink' : 'text-faint hover:text-pencil'}`}
              >
                <Icon name={t.icon} size={14} />
                {t.label}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Grading scale */}
      <section className="doc p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-1">
          <div>
            <h2 className="font-display text-lg font-semibold">Grading Scale</h2>
            <p className="text-sm text-pencil">Minimum percentage for each letter. Below D is an F.</p>
          </div>
          <button
            onClick={() => { setScaleDraft({ ...DEFAULT_SCALE }); setScaleDirty(true); }}
            className="text-xs font-semibold text-faint hover:text-mark-deep transition-colors mt-1"
          >
            Reset to 90/80/70/60
          </button>
        </div>
        <div className="divide-y divide-hairline mt-4">
          {SCALE_ROWS.map(({ letter, hint }) => (
            <div key={letter} className="flex items-center justify-between py-3.5">
              <div className="flex items-center gap-4">
                <span className="font-display text-2xl font-bold w-8 text-mark-deep">{letter}</span>
                <span className="text-sm text-pencil">{hint} — {letter === 'D' ? 'minimum passing' : `and above`}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-faint">≥</span>
                <Input
                  type="number" min={0} max={100}
                  value={scaleDraft[letter]}
                  onChange={e => { setScaleDraft(d => ({ ...d, [letter]: parseFloat(e.target.value) })); setScaleDirty(true); }}
                  className="!w-24 !h-9 text-center font-mono font-semibold"
                />
                <span className="text-xs text-faint w-4">%</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between pt-4 mt-2 border-t border-hairline">
          <Toggle
            checked={partialCredit}
            onChange={async v => {
              setPartialCredit(v);
              setRegrading(true);
              await regradeAll();
              setRegrading(false);
              flash(v ? 'Partial credit on — every stored sheet re-graded.' : 'Partial credit off — every stored sheet re-graded.');
            }}
            label="Partial credit on multi-mark questions"
            description="A 'mark all that apply' answer scores the fraction of correct options chosen. Toggling re-grades stored sheets."
          />
        </div>
        <div className="flex justify-end gap-3 mt-4">
          <Button
            variant="outline"
            icon="restart_alt"
            disabled={regrading || scans.length === 0}
            className="h-10"
            onClick={async () => { setRegrading(true); await regradeAll(); setRegrading(false); flash('Every stored sheet re-graded with the current rules.'); }}
          >
            Re-grade all sheets
          </Button>
          <Button variant="solid" onClick={() => void saveScale()} disabled={!scaleDirty || regrading} className="h-10 px-6">
            {regrading ? 'Re-grading…' : 'Save scale + re-grade all'}
          </Button>
        </div>
      </section>

      {/* Sheet reader */}
      <section className="doc p-6 mb-6">
        <h2 className="font-display text-lg font-semibold">Sheet Reader</h2>
        <p className="text-sm text-pencil mt-1 mb-4">
          Photos and scanned pages are read with Gemini. Filled GradeStack PDFs grade locally — no key needed.
        </p>
        <div className="flex gap-2">
          <Input
            type="password"
            value={keyDraft}
            onChange={e => { setKeyDraft(e.target.value); setKeyDirty(true); }}
            placeholder="Gemini API key — stored only in this browser"
            className="flex-1 font-mono"
            autoComplete="off"
          />
          <Button
            variant="outline"
            className="h-10"
            disabled={!keyDirty}
            onClick={() => { setGeminiKey(keyDraft.trim()); setKeyDirty(false); flash(keyDraft.trim() ? 'Reader key saved.' : 'Reader key cleared.'); }}
          >
            Save
          </Button>
        </div>
        <p className="text-xs text-faint mt-2">
          {geminiKey ? 'A key is stored in this browser.' : 'No key stored — the build-time key (if any) is used.'}
          {' '}Get one at aistudio.google.com.
        </p>
      </section>

      {/* Data */}
      <section className="doc p-6 mb-6">
        <h2 className="font-display text-lg font-semibold mb-1">Your Data</h2>
        <p className="text-sm text-pencil mb-5">
          {tests.length} assessment{tests.length === 1 ? '' : 's'} · {scans.length} sheet{scans.length === 1 ? '' : 's'} in this register.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline" icon="download"
            onClick={() => downloadFile(`gradestack-backup-${new Date().toISOString().slice(0, 10)}.json`, exportData(), 'application/json')}
          >
            Export backup (JSON)
          </Button>
          <Button variant="outline" icon="upload" onClick={() => fileRef.current?.click()}>
            Restore backup
          </Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void handleImport(e)} />
        </div>
        <p className="text-xs text-faint mt-3">Backups include settings and all register data — sheet photos are left out to keep files small.</p>
      </section>

      {/* Sync */}
      <section className="doc p-6 mb-6">
        <h2 className="font-display text-lg font-semibold mb-1">Cloud Sync</h2>
        {firebaseEnabled ? (
          user ? (
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-3">
                {user.photoURL
                  ? <img src={user.photoURL} alt="" className="w-9 h-9 rounded-full border border-hairline-strong" referrerPolicy="no-referrer" />
                  : <div className="w-9 h-9 rounded-full bg-mark-mist flex items-center justify-center font-mono text-xs font-semibold text-mark-deep">{(user.email || '?')[0].toUpperCase()}</div>}
                <div>
                  <p className="text-sm font-semibold text-ink">{user.displayName || user.email}</p>
                  <p className="text-xs text-pencil">Syncing to this account</p>
                </div>
              </div>
              <Button variant="ghost" onClick={() => void logOut()}>Sign out</Button>
            </div>
          ) : (
            <div className="mt-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-pencil">Sign in to keep the register in sync across devices.</p>
                <Button variant="outline" icon="login" onClick={() => void handleSignIn()} className="h-10 shrink-0">Sign in with Google</Button>
              </div>
              {signInError && (
                <p className="text-red text-xs leading-relaxed mt-3 flex items-start gap-1.5">
                  <Icon name="error" size={15} className="shrink-0 mt-px" />
                  <span>{signInError}</span>
                </p>
              )}
            </div>
          )
        ) : (
          <p className="text-sm text-pencil mt-3">No Firebase project is configured, so everything stays in this browser's storage. Backups above still work.</p>
        )}
      </section>

      {/* Danger */}
      <section className="doc p-6 border-red/25">
        <h2 className="font-display text-lg font-semibold text-red mb-1">Factory Reset</h2>
        <p className="text-sm text-pencil mb-4">Wipes every assessment, every graded sheet, and all settings — local and (if signed in) synced.</p>
        {confirmReset ? (
          <div className="flex items-center gap-3">
            <Button variant="danger" icon="delete_forever" onClick={() => void handleReset()} className="h-10">Yes, wipe everything</Button>
            <Button variant="ghost" onClick={() => setConfirmReset(false)} className="h-10">Cancel</Button>
          </div>
        ) : (
          <Button variant="outline" className="h-10 border-red/40 text-red hover:bg-red-mist" onClick={() => setConfirmReset(true)}>
            Clear all data…
          </Button>
        )}
      </section>
    </div>
  );
}
