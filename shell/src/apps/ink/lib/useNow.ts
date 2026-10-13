import { useEffect, useState } from 'react';

/**
 * The current time, re-ticked on a slow interval.
 * Date.now() can't be called during render (impure), and a mount-time
 * snapshot goes stale — "5 minutes ago" stays forever, and day-rollover
 * never happens. A 30s tick keeps relative labels honest for ~0 cost.
 */
export const useNow = (intervalMs = 30_000): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
};
