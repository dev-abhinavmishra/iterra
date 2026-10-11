export interface Session {
  id: string;
  duration: number; // in seconds
  type: 'focus' | 'break' | 'interval' | 'stopwatch';
  timestamp: number;
  label?: string;   // session intent, e.g. "Chapter 4 review"
  preset?: string;  // preset/routine name
}

const STORAGE_KEY = 'timer.sessions.v1';
const LEGACY_KEYS = ['platform.sessions.v1', 'obsidian_pulse_sessions'];

export function saveSession(session: Omit<Session, 'id' | 'timestamp'>) {
  if (typeof window === 'undefined') return;
  const sessions = getSessions();
  const newSession: Session = {
    ...session,
    id: Math.random().toString(36).substring(2, 9),
    timestamp: Date.now(),
  };
  sessions.push(newSession);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

export function getSessions(): Session[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) return JSON.parse(data);
    // one-time migration from previous builds
    for (const legacyKey of LEGACY_KEYS) {
      const legacy = localStorage.getItem(legacyKey);
      if (legacy) {
        const parsed = JSON.parse(legacy);
        localStorage.setItem(STORAGE_KEY, legacy);
        localStorage.removeItem(legacyKey);
        return parsed;
      }
    }
    return [];
  } catch (e) {
    return [];
  }
}

export function clearSessions() {
  localStorage.removeItem(STORAGE_KEY);
  LEGACY_KEYS.forEach(k => localStorage.removeItem(k));
}

export function sessionsCsv(sessions: Session[]): string {
  const rows = sessions.map(s => {
    const d = new Date(s.timestamp);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const label = (s.label || '').replace(/"/g, '""');
    const preset = (s.preset || '').replace(/"/g, '""');
    return `"${iso}","${s.type}",${s.duration},"${label}","${preset}"`;
  });
  return ['"date","type","seconds","label","preset"', ...rows].join('\n');
}

export function getStats() {
  const sessions = getSessions();
  const now = Date.now();
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const weeklySessions = sessions.filter(s => s.timestamp >= oneWeekAgo);
  const focus = (list: Session[]) => list.filter(s => s.type === 'focus' || s.type === 'interval');

  const weeklyFocus = focus(weeklySessions);
  const totalFocusSeconds = weeklyFocus.reduce((acc, s) => acc + s.duration, 0);
  const totalFocusHours = (totalFocusSeconds / 3600).toFixed(1);

  const allFocus = focus(sessions);
  const allTimeSeconds = allFocus.reduce((a, s) => a + s.duration, 0);
  const allTimeHours = (allTimeSeconds / 3600).toFixed(1);

  const avgSessionLength = weeklyFocus.length > 0
    ? Math.round((totalFocusSeconds / weeklyFocus.length) / 60)
    : 0;

  const completedSessions = weeklyFocus.length;

  // daily distribution for the last 7 days
  const distribution = Array(7).fill(0);
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  weeklyFocus.forEach(s => {
    const sessionDate = new Date(s.timestamp);
    sessionDate.setHours(0, 0, 0, 0);
    const daysAgo = Math.floor((todayDate.getTime() - sessionDate.getTime()) / 86400000);
    if (daysAgo >= 0 && daysAgo < 7) distribution[6 - daysAgo] += s.duration;
  });

  const maxDaily = Math.max(...distribution, 1);
  const chartData = distribution.map(val => `${Math.round((val / maxDaily) * 100)}%`);

  const deepFocusScore = Math.min(100, Math.round(
    (totalFocusSeconds / (20 * 3600)) * 50 + (avgSessionLength / 60) * 50
  )) || 0;

  // streak: consecutive days (ending today or yesterday) with >=1 focus session
  const daySet = new Set(allFocus.map(s => {
    const d = new Date(s.timestamp);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }));
  let streak = 0;
  const cursor = new Date();
  if (!daySet.has(`${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`)) {
    cursor.setDate(cursor.getDate() - 1); // today not done yet — start from yesterday
  }
  while (daySet.has(`${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`)) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  // best single day (seconds)
  const byDay = new Map<string, number>();
  allFocus.forEach(s => {
    const d = new Date(s.timestamp);
    const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    byDay.set(k, (byDay.get(k) || 0) + s.duration);
  });
  const bestDaySeconds = Math.max(0, ...byDay.values());

  return {
    totalFocusHours,
    allTimeHours,
    avgSessionLength,
    completedSessions,
    chartData,
    deepFocusScore,
    streak,
    bestDayMinutes: Math.round(bestDaySeconds / 60),
    recentSessions: sessions.slice(-5).reverse(),
    allSessions: [...sessions].reverse()
  };
}
