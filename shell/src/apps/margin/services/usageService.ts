import { useEffect, useReducer } from 'react';
import { supabase } from './supabaseClient';
import { getCaptchaToken, hcaptchaConfigured } from './hcaptcha';

// Client-side mirror of the server's free-usage limit + Supabase anonymous auth.
//
// On load we sign in anonymously (if enabled on the project) so the browser gets
// a real auth.users uuid; its JWT is then sent on every API call and the backend
// enforces limits via the user_limits RPCs. If anonymous auth is unavailable, we
// silently fall back to the per-browser anonymous id below.
//
// The server (api/_usage.ts) is the authoritative enforcement layer; this store
// holds the latest known status so the UI can render the usage badge and limit
// notice instantly.

const UID_KEY = 'modularai_uid';

let authReady: Promise<void> | null = null;

const ensureAuth = async (): Promise<void> => {
    if (!supabase) return;
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            // Try a plain anonymous sign-in first; only solve a captcha if Supabase
            // demands one (CAPTCHA protection enabled), then retry with the token.
            let { error } = await supabase.auth.signInAnonymously();
            if (error && /captcha/i.test(error.message) && hcaptchaConfigured()) {
                const captchaToken = await getCaptchaToken();
                if (captchaToken) {
                    ({ error } = await supabase.auth.signInAnonymously({ options: { captchaToken } }));
                }
            }
            if (error) {
                console.warn('[usage] Supabase anonymous auth unavailable:', error.message,
                    '— enable it under Authentication → Providers → Anonymous (and set the hCaptcha secret if CAPTCHA protection is on). Falling back to anonymous limit.');
            }
        }
    } catch (e) {
        console.warn('[usage] auth init failed; using anonymous fallback', e);
    }
};

/** Idempotently kick off anonymous sign-in. */
export const initAuth = (): Promise<void> => {
    if (!authReady) authReady = ensureAuth();
    return authReady;
};

/** Current Supabase access token (JWT), or null if not signed in. */
export const getAccessToken = async (): Promise<string | null> => {
    if (!supabase) return null;
    try {
        await initAuth();
        const { data: { session } } = await supabase.auth.getSession();
        return session?.access_token || null;
    } catch {
        return null;
    }
};

export interface UsageState {
    used: number;
    limit: number;
    remaining: number;
    reachedLimit: boolean;
    loaded: boolean;
}

let state: UsageState = { used: 0, limit: 15, remaining: 15, reachedLimit: false, loaded: false };
const listeners = new Set<() => void>();

const emit = () => listeners.forEach(l => l());

export const getUsageState = (): UsageState => state;

export const setUsageState = (patch: Partial<UsageState>): void => {
    state = { ...state, ...patch, loaded: true };
    emit();
};

export const subscribeUsage = (l: () => void): (() => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
};

/** Stable anonymous id for this browser, used to key the daily limit. */
export const getUserId = (): string => {
    try {
        let id = localStorage.getItem(UID_KEY);
        if (!id) {
            id = (crypto?.randomUUID?.() || `u_${Date.now()}_${Math.floor(Math.random() * 1e9)}`);
            localStorage.setItem(UID_KEY, id);
        }
        return id;
    } catch {
        return 'anonymous';
    }
};

/** Fetch the latest usage from the server. */
export const refreshUsage = async (): Promise<void> => {
    try {
        const token = await getAccessToken();
        const headers: Record<string, string> = { 'x-user-id': getUserId() };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch('/api/usage', { headers });
        if (res.ok) {
            const data = await res.json();
            setUsageState(data);
        }
    } catch {
        /* offline / no backend — keep current state */
    }
};

/** Signal that the limit was hit, so listeners (App) can open the limit modal. */
export const triggerUpgrade = (): void => {
    setUsageState({ reachedLimit: true, remaining: 0 });
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('usage-limit-reached'));
    }
};

/** React hook for subscribing to usage state. */
export const useUsage = (): UsageState => {
    const [, force] = useReducer((x: number) => x + 1, 0);
    useEffect(() => subscribeUsage(force), []);
    return getUsageState();
};
