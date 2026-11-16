import { describe, expect, it } from 'vitest';
import { describeDataStatus } from './dataStatus';

describe('describeDataStatus', () => {
  it('reports missing or unreadable status conservatively', () => {
    const status = describeDataStatus(null, true);
    expect(status.label).toBe('Shared data status unavailable');
    expect(status.tone).toBe('neutral');
    expect(status.detail).toMatch(/covers shared records only/i);
    expect(status.detail).toMatch(/network/i);
    expect(status.detail).toMatch(/backup/i);
  });

  it('reports detached shared data as browser only', () => {
    const status = describeDataStatus({ attached: false, queued: 2 }, true);
    expect(status.label).toBe('Shared data sync inactive');
    expect(status.detail).toMatch(/shared records are not connected/i);
    expect(status.detail).toMatch(/private tool data remains local to this browser/i);
  });

  it('prioritizes offline state while disclosing queued changes', () => {
    const status = describeDataStatus({ attached: true, queued: 2, error: 'ignored', lastPull: 1 }, false);
    expect(status.label).toBe('Shared data sync offline');
    expect(status.detail).toMatch(/2 shared changes are waiting/i);
    expect(status.detail).toMatch(/network/i);
    expect(status.detail).toMatch(/backup/i);
    expect(status.tone).toBe('warn');
  });

  it('prioritizes an error over a queue and still discloses the backlog', () => {
    const status = describeDataStatus({ attached: true, queued: 1, error: 'account-name', lastPull: 1 }, true);
    expect(status.label).toBe('Shared data sync issue');
    expect(status.detail).toMatch(/1 shared change is waiting/i);
    expect(status.detail).not.toContain('account-name');
  });

  it('reports queued changes with correct singular and plural labels', () => {
    const singular = describeDataStatus({ attached: true, queued: 1, lastPull: 1 }, true);
    const plural = describeDataStatus({ attached: true, queued: 3, lastPull: 1 }, true);
    expect(singular.label).toBe('1 shared change queued');
    expect(singular.detail).toMatch(/1 shared change is waiting/i);
    expect(plural.label).toBe('3 shared changes queued');
    expect(plural.detail).toMatch(/3 shared changes are waiting/i);
  });

  it('shows connecting when no pull has completed', () => {
    const status = describeDataStatus({ attached: true, queued: 0, lastPull: null }, true);
    expect(status.label).toBe('Shared data sync connecting');
    expect(status.tone).toBe('neutral');
  });

  it('treats a retained pull from before this attachment as connecting', () => {
    const status = describeDataStatus({ attached: true, queued: 0, attachedAt: 200, lastPull: 100 }, true);
    expect(status.label).toBe('Shared data sync connecting');
  });

  it('treats a missing attached field as unreadable', () => {
    const status = describeDataStatus({ queued: 0, lastPull: 100 }, true);
    expect(status.label).toBe('Shared data status unavailable');
  });

  it('uses connected wording without claiming all edits are synced', () => {
    const status = describeDataStatus({ attached: true, queued: 0, lastPull: 123 }, true);
    expect(status.label).toBe('Shared data sync connected');
    expect(status.tone).toBe('ok');
    expect(status.detail).toMatch(/does not track writes still in progress/i);
    expect(status.label).not.toMatch(/synced|synchronized/i);
    expect(status.detail).not.toMatch(/every edit|all edits|everything is synced/i);
  });
});
