// Notes store dates in a mix of ISO and locale strings depending on where
// they were created — normalize to one short form everywhere a date is shown.
export const shortDate = (raw?: string): string => {
    if (!raw) return '';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }),
    });
};

// Durations are stored formatted ("24:07") but older rows may hold a bare
// second count — render those as m:ss.
export const showDuration = (d?: string | number): string | undefined => {
    if (d === undefined || d === null || d === '') return undefined;
    const raw = String(d).trim();
    if (!/^\d+$/.test(raw)) return raw;
    const s = parseInt(raw, 10);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
};
