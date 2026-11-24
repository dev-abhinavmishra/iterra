import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../ui/primitives';
import type { User } from '@supabase/supabase-js';

type Challenge = { email: string; type: 'email' | 'email_change'; uid?: string };

async function authClient() {
  const { supabase } = await import('../apps/margin/services/supabaseClient');
  if (!supabase) throw new Error('Email access is unavailable in this build.');
  return supabase.auth;
}

function readOwner() {
  try { return localStorage.getItem('iterra.v1.sync.owner'); } catch { return null; }
}

export function WorkspaceAccount() {
  const [owner, setOwner] = useState(readOwner);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    const refreshOwner = () => setOwner(readOwner());
    refreshOwner();
    const timer = window.setInterval(refreshOwner, 1500);
    let alive = true;
    let stop: (() => void) | undefined;
    authClient().then(auth => {
      if (!alive) return;
      const { data } = auth.onAuthStateChange((_event, session) => {
        if (alive) { setUser(session?.user ?? null); setReady(true); }
      });
      stop = () => data.subscription.unsubscribe();
    }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; window.clearInterval(timer); stop?.(); };
  }, [open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const auth = await authClient();
      const { data, error: sessionError } = await auth.getSession();
      if (sessionError) throw sessionError;
      const current = data.session?.user;
      const owner = localStorage.getItem('iterra.v1.sync.owner');
      const address = email.trim();
      const redirect = new URL(window.location.pathname, window.location.origin);
      redirect.searchParams.set('workspace-account', '1');
      if (challenge) {
        if (challenge.uid && current?.id !== challenge.uid) throw new Error('Your session changed. Request a new code.');
        const result = await auth.verifyOtp({ type: challenge.type, email: challenge.email, token: code.trim() });
        if (result.error) throw result.error;
        setChallenge(null);
        setCode('');
        setEmail('');
      } else if (current?.is_anonymous && owner === current.id) {
        const result = await auth.updateUser({ email: address }, { emailRedirectTo: redirect.href });
        if (result.error) throw result.error;
        setChallenge({ type: 'email_change', email: address, uid: current.id });
      } else {
        if (window.iterra?.sync?.status?.().enabled) throw new Error('Wait for shared sync to connect before linking this workspace, or turn it off to sign in.');
        if (current?.email) throw new Error('This browser is already signed in.');
        const result = await auth.signInWithOtp({ email: address, options: { shouldCreateUser: false, emailRedirectTo: redirect.href } });
        if (result.error) throw result.error;
        setChallenge({ type: 'email', email: address });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Email access failed. Please try again.');
    } finally { setBusy(false); }
  }

  const linking = user?.is_anonymous && owner === user.id;
  return <div className="mb-3 rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)] px-4 py-3 text-[13px]">
    <button type="button" aria-expanded={open} className="cursor-pointer font-semibold" onClick={() => setOpen(!open)}>Workspace account</button>
    {open && <div className="mt-2 space-y-2">
      {ready && (user?.email && !user.is_anonymous ? <>
        <p>Signed in as {user.email}.</p>
        <p>{owner && owner !== user.id ? 'This browser belongs to another workspace. Open a separate browser profile to sync this account.' : 'Enable shared record sync on each device where you want your workspace records.'}</p>
        <Button disabled={busy} onClick={async () => {
          setBusy(true); setError('');
          try {
            if (window.iterra?.sync?.status?.().enabled && !window.iterra.sync.setEnabled?.(false)?.ok) throw new Error('Turn off sync before signing out.');
            const result = await (await authClient()).signOut({ scope: 'local' });
            if (result.error) throw result.error;
            setChallenge(null); setCode('');
          } catch (e) { setError(e instanceof Error ? e.message : 'Sign-out failed.'); }
          finally { setBusy(false); }
        }}>Sign out of this browser</Button>
        <p className="text-[12px]">Signing out keeps this browser’s local study data.</p>
      </> : <form className="space-y-2" onSubmit={submit}>
        <p>{challenge ? 'Check ' + challenge.email + '. Open the confirmation link or enter the code from the email.' : linking ? 'Link an email to keep your existing workspace and access its shared records on another device.' : 'Sign in with a previously linked email. To create an account for this workspace, enable shared record sync first, then link an email.'}</p>
        <label className="block">{challenge ? 'Verification code' : 'Email address'}
          <input className="ml-2 max-w-full rounded border border-[var(--color-line)] px-2 py-1" required type={challenge ? 'text' : 'email'} autoComplete={challenge ? 'one-time-code' : 'email'} value={challenge ? code : email} onChange={e => challenge ? setCode(e.target.value) : setEmail(e.target.value)} />
        </label>
        <button type="submit" disabled={busy} className="cursor-pointer font-semibold underline">{challenge ? 'Verify code' : linking ? 'Link email' : 'Send sign-in email'}</button>
        {challenge && <button type="button" disabled={busy} className="ml-4 underline" onClick={() => { setChallenge(null); setCode(''); setError(''); }}>Start over</button>}
      </form>)}
      {!ready && !error && <p role="status">Loading account…</p>}
      {error && <p role="alert">{error}</p>}
    </div>}
  </div>;
}
