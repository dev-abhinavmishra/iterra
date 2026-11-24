// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SettingsSurface } from './SettingsSurface';

const backupMocks = vi.hoisted(() => ({
  collectBackup: vi.fn(),
  downloadBackup: vi.fn(),
  parseBackup: vi.fn(),
  restoreBackup: vi.fn(),
  summarizeBackup: vi.fn(),
  wipeAll: vi.fn(),
}));

vi.mock('../integration/backup', () => backupMocks);
vi.mock('../integration/demo', () => ({
  demoRowCount: vi.fn(async () => 0),
  isDemoLoaded: vi.fn(() => false),
  removeDemoData: vi.fn(),
  seedDemoSemester: vi.fn(),
}));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

const backupData = {
  format: 'iterra-backup' as const,
  v: 1,
  at: 1_700_000_000_000,
  localStorage: {},
  idb: {},
};

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.localStorage.removeItem('iterra.v1.sync.enabled');
  delete (window as any).iterra;
  backupMocks.collectBackup.mockReset().mockResolvedValue(backupData);
  backupMocks.downloadBackup.mockReset();
  backupMocks.parseBackup.mockReset().mockReturnValue(backupData);
  backupMocks.restoreBackup.mockReset().mockResolvedValue({});
  backupMocks.summarizeBackup.mockReset().mockReturnValue({
    at: backupData.at,
    records: 3,
    dbs: 1,
    lsKeys: 2,
  });
  backupMocks.wipeAll.mockReset();

  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function renderSettings() {
  act(() => {
    root.render(
      <SettingsSurface
        onGo={vi.fn()}
        dataStatus={{ label: 'Local data', detail: 'Saved in this browser.', tone: 'ok' }}
        accent="green"
        onAccentChange={vi.fn()}
      />,
    );
  });
}

async function chooseBackup() {
  const file = { text: vi.fn(async () => '{"backup":true}') } as unknown as File;
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

it('announces a failed backup download as an alert', async () => {
  backupMocks.collectBackup.mockRejectedValueOnce(new Error('storage denied'));
  renderSettings();

  const download = [...host.querySelectorAll('button')]
    .find((button) => button.textContent?.includes('Download backup'))!;
  await act(async () => download.click());

  const alert = host.querySelector('[role="alert"]');
  expect(alert?.textContent).toContain('Backup failed');
});

it('keeps sync off until the user confirms the shared-record scope', async () => {
  const setEnabled = vi.fn(() => ({ ok: true, enabled: true }));
  window.localStorage.removeItem('iterra.v1.sync.enabled');
  (window as any).iterra = { sync: { status: () => ({ enabled: false }), setEnabled } };
  renderSettings();

  const toggle = host.querySelector<HTMLButtonElement>('[aria-label="Sync shared records"]')!;
  expect(toggle.getAttribute('aria-checked')).toBe('false');
  await act(async () => toggle.click());
  expect(setEnabled).not.toHaveBeenCalled();
  const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(dialog.textContent).toMatch(/existing canonical shared records/i);
  expect(dialog.textContent).toMatch(/link an email in Workspace account/i);

  const enable = [...dialog.querySelectorAll('button')].find((button) => button.textContent?.includes('Enable sync'))!;
  await act(async () => enable.click());
  expect(setEnabled).toHaveBeenCalledWith(true);
  expect(toggle.getAttribute('aria-checked')).toBe('true');
});

it('announces an invalid backup file as an alert', async () => {
  backupMocks.parseBackup.mockImplementationOnce(() => { throw new Error("That file isn't an Iterra backup."); });
  renderSettings();
  await chooseBackup();

  const alert = host.querySelector('[role="alert"]');
  expect(alert?.textContent).toContain("That file isn't an Iterra backup.");
});

it('associates the restore warning with the confirmation dialog and announces restore failure', async () => {
  backupMocks.restoreBackup.mockRejectedValueOnce(new Error('restore failed'));
  renderSettings();
  await chooseBackup();

  const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!;
  const descriptionId = dialog.getAttribute('aria-describedby');
  expect(descriptionId).toBeTruthy();
  expect(document.getElementById(descriptionId!)?.textContent).toContain(
    'Everything currently stored in this browser will be replaced',
  );

  const replace = [...dialog.querySelectorAll('button')]
    .find((button) => button.textContent?.includes('Replace everything'))!;
  await act(async () => replace.click());

  const alert = host.querySelector('[role="alert"]');
  expect(alert?.textContent).toContain('Restore failed partway');
});
