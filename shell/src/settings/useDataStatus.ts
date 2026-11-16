import { useEffect, useState } from 'react';
import { describeDataStatus } from './dataStatus';

function readDataStatus() {
  const online = navigator.onLine;
  try {
    return describeDataStatus(window.iterra?.sync?.status() ?? null, online);
  } catch {
    return describeDataStatus(null, online);
  }
}

export function useDataStatus() {
  const [status, setStatus] = useState(readDataStatus);

  useEffect(() => {
    const refresh = () => {
      const next = readDataStatus();
      setStatus((previous) =>
        previous.label === next.label && previous.detail === next.detail && previous.tone === next.tone
          ? previous
          : next,
      );
    };
    // The hub exposes a snapshot but has no sync status subscription.
    const timer = window.setInterval(refresh, 2000);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    document.addEventListener('visibilitychange', refresh);
    refresh();
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  return status;
}
