// Invisible hCaptcha integration.
//
// When Supabase Auth has CAPTCHA protection enabled, anonymous sign-in requires a
// captcha token. We render an invisible hCaptcha widget, solve it silently, and
// pass the token to signInAnonymously(). If no site key is configured (or solving
// fails), callers fall back to a token-less sign-in / the anonymous limit path.

declare global {
    interface Window {
        hcaptcha?: any;
        __hcaptchaOnLoad?: () => void;
    }
}

const SITE_KEY = process.env.HCAPTCHA_SITE_KEY as string | undefined;

let loadPromise: Promise<any> | null = null;
let widgetId: string | null = null;
let containerEl: HTMLElement | null = null;

export const hcaptchaConfigured = (): boolean => !!SITE_KEY;

const loadScript = (): Promise<any> => {
    if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
    if (window.hcaptcha) return Promise.resolve(window.hcaptcha);
    if (loadPromise) return loadPromise;

    loadPromise = new Promise((resolve, reject) => {
        window.__hcaptchaOnLoad = () => resolve(window.hcaptcha);
        const s = document.createElement('script');
        s.src = 'https://js.hcaptcha.com/1/api.js?render=explicit&onload=__hcaptchaOnLoad';
        s.async = true;
        s.defer = true;
        s.onerror = () => reject(new Error('hCaptcha script failed to load'));
        document.head.appendChild(s);
    });
    return loadPromise;
};

/** Solve an invisible hCaptcha and return the token, or null on any failure. */
export const getCaptchaToken = async (): Promise<string | null> => {
    if (!SITE_KEY) return null;
    try {
        const hc = await loadScript();
        if (!containerEl) {
            containerEl = document.createElement('div');
            containerEl.id = 'hcaptcha-invisible';
            document.body.appendChild(containerEl);
        }
        if (widgetId === null) {
            widgetId = hc.render(containerEl, { sitekey: SITE_KEY, size: 'invisible' });
        } else {
            hc.reset(widgetId);
        }
        // Guard against a hung challenge so it can never block sign-in.
        const result = await Promise.race([
            hc.execute(widgetId, { async: true }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('hCaptcha timeout')), 15000)),
        ]) as { response?: string };
        return result?.response || null;
    } catch (e) {
        console.warn('[hcaptcha] could not obtain token:', e);
        return null;
    }
};
