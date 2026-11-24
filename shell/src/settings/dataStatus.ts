export interface SyncSnapshot {
  attached?: boolean;
  attachedAt?: number | null;
  queued?: number;
  error?: string | null;
  lastPull?: number | null;
  enabled?: boolean;
  providerAvailable?: boolean | null;
  pausedReason?: string | null;
}

export interface DataStatus {
  label: string;
  detail: string;
  tone: 'ok' | 'warn' | 'neutral';
}

/** Describe only shared-record sync; private tool data stays in this browser. */
export function describeDataStatus(sync: SyncSnapshot | null, online: boolean): DataStatus {
  if (!sync || typeof sync !== 'object' || typeof sync.attached !== 'boolean') {
    return {
      label: 'Shared data status unavailable',
      detail: 'This status covers shared records only. Sync status could not be read. Check your network and keep a backup of important data.',
      tone: 'neutral',
    };
  }

  if (sync.pausedReason === 'identity-mismatch') {
    return {
      label: 'Shared data sync paused for this identity',
      detail: 'This browser is bound to a different anonymous identity. Continue in the browser profile that enabled sync, or export a backup and use a separate profile. No data was moved.',
      tone: 'warn',
    };
  }
  if (sync.pausedReason === 'signed-out') {
    return {
      label: 'Shared data sync paused after sign-out',
      detail: 'Sign back into the original browser session to continue. Your local data remains in this browser.',
      tone: 'warn',
    };
  }
  if (sync.pausedReason === 'supabase-auth-unavailable') {
    return {
      label: 'Shared data sync needs authentication setup',
      detail: 'Check that Anonymous sign-ins are enabled in the Supabase project. If CAPTCHA protection is enabled, configure its site key in this app and the matching secret in Supabase. Shared records remain in this browser until a session is available.',
      tone: 'warn',
    };
  }
  if (sync.providerAvailable === false) {
    return {
      label: 'Shared data sync unavailable',
      detail: 'This build has no sync service configured. Shared records remain in this browser. Keep a backup of important data.',
      tone: 'neutral',
    };
  }

  if (sync.enabled === false) {
    return {
      label: 'Shared data sync off',
      detail: 'Shared records stay in this browser unless you enable sync below. Private tool data also remains local. Keep a backup of important data.',
      tone: 'neutral',
    };
  }

  if (!sync.attached) {
    if (sync.pausedReason) {
      return {
        label: 'Shared data sync paused',
        detail: 'Sync could not connect. Check your connection and sign-in, then reopen Settings to retry. Your local data remains available.',
        tone: 'warn',
      };
    }
    return {
      label: 'Shared data sync inactive',
      detail: 'Shared records are not connected. Private tool data remains local to this browser. Keep a backup of important data.',
      tone: 'neutral',
    };
  }

  const queued = Number.isFinite(sync.queued) ? Math.max(0, Math.floor(sync.queued!)) : 0;
  const backlog = queued > 0
    ? `${queued} shared ${queued === 1 ? 'change is' : 'changes are'} waiting to transfer. `
    : '';
  const recovery = 'Check your network and keep a backup of important data.';

  if (!online) {
    return {
      label: 'Shared data sync offline',
      detail: `${backlog}Shared records cannot reach the sync service while this browser is offline. ${recovery}`,
      tone: 'warn',
    };
  }

  if (sync.error) {
    return {
      label: 'Shared data sync issue',
      detail: `${backlog}There is a problem transferring shared records. ${recovery}`,
      tone: 'warn',
    };
  }

  if (queued > 0) {
    return {
      label: `${queued} shared ${queued === 1 ? 'change' : 'changes'} queued`,
      detail: `${backlog}Shared records are waiting for transfer. ${recovery}`,
      tone: 'warn',
    };
  }

  if (!sync.lastPull || (sync.attachedAt != null && sync.lastPull < sync.attachedAt)) {
    return {
      label: 'Shared data sync connecting',
      detail: 'This status covers shared records only. Check your network and keep a backup of important data.',
      tone: 'neutral',
    };
  }

  return {
    label: 'Shared data sync connected',
    detail: 'Shared records are connected. This status does not track writes still in progress. Keep a backup of important data.',
    tone: 'ok',
  };
}
