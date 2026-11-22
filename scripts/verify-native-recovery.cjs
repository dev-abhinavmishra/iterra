/*
 * Native Ink + Planning recovery and cross-tab regression harness.
 *
 * Run only against a freshly rebuilt root candidate:
 *   node scripts/verify-native-recovery.cjs http://127.0.0.1:8090
 *
 * The browser creates a real personal course, assignment, and Ink note; a
 * Settings backup is then restored while a frozen peer tab holds newer state.
 * The harness also injects a single native IndexedDB state write failure after
 * the synchronous pending receipt exists, then hard-reloads with the normal
 * browser prototype so startup replay is exercised.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../node_modules/playwright-core');

const root = path.resolve(__dirname, '..');
const base = process.argv[2] || 'http://127.0.0.1:8090';
const out = path.join(root, 'tmp', 'native-recovery');
const nativeDb = 'iterra-native-state';
const receiptPrefix = 'iterra.native.pending.';
const chrome = [
  'C:/Users/pmsma/AppData/Local/ms-playwright/chromium-1243/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(fs.existsSync);
if (!chrome) throw new Error('No Chromium-family browser found');
fs.mkdirSync(out, { recursive: true });

const run = `native-${Date.now().toString(36)}`;
const noteA = `${run}-personal-ink`;
const noteB = `${run}-post-backup-ink`;
const taskA = `${run}-personal-assignment`;
const taskB = `${run}-post-backup-assignment`;
const receiptEditTitle = `${run}-receipt-recovered-title`;
const dateIn = (days) => {
  const d = new Date(Date.now() + days * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function nativeSnapshot(page) {
  return page.evaluate(async dbName => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const required = ['states', 'receipts', 'meta', 'applied'];
    const absent = required.filter(name => !db.objectStoreNames.contains(name));
    if (absent.length) { db.close(); throw new Error(`Native store missing object stores: ${absent.join(', ')}`); }
    const tx = db.transaction(required, 'readonly');
    const read = name => new Promise((resolve, reject) => {
      const request = tx.objectStore(name).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const [states, receipts, meta, applied] = await Promise.all(required.map(read));
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error); });
    db.close();
    return { states, receipts, meta, applied };
  }, nativeDb);
}

async function nativeState(page, key) {
  const snapshot = await nativeSnapshot(page);
  return snapshot.states.find(row => row.key === key)?.state ?? null;
}

async function generation(page) {
  const snap = await nativeSnapshot(page);
  return snap.meta.find(row => row.key === 'generation')?.value ?? null;
}

async function projectedEpochs(page) {
  return page.evaluate(() => Object.fromEntries(['ink-notes-storage', 'syllabus.folio.v1'].map(key => {
    const wrapper = JSON.parse(localStorage.getItem(key) || 'null');
    return [key, {
      generation: wrapper?.__nativeGeneration ?? null,
      keyGeneration: wrapper?.__nativeKeyGeneration ?? null,
    }];
  })));
}

async function waitFor(fn, label, timeout = 30000) {
  const stop = Date.now() + timeout;
  while (Date.now() < stop) {
    if (await fn()) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function waitNoReceipts(page, label = 'native writes to flush') {
  await waitFor(async () => {
    const [snap, pendingLs] = await Promise.all([
      nativeSnapshot(page),
      page.evaluate(prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix)), receiptPrefix),
    ]);
    return snap.receipts.length === 0 && pendingLs.length === 0;
  }, label, 30000);
}

async function noteByTitle(page, title) {
  const state = await nativeState(page, 'ink-notes-storage');
  return state?.notes?.find(note => note.title === title) ?? null;
}

async function commitments(page) {
  const state = await nativeState(page, 'syllabus.folio.v1');
  return Object.values(state?.commitments || {});
}

async function assignmentByTitle(page, title) {
  return (await commitments(page)).find(row => row.title === title) ?? null;
}

async function createNote(page, title, body) {
  await page.goto(`${base}/#/p/ink`);
  const newNote = page.getByRole('button', { name: 'New note', exact: true });
  await newNote.waitFor();
  await newNote.click();
  await page.getByRole('textbox', { name: 'Note title' }).fill(title);
  const editor = page.locator('.tiptap[contenteditable=true]').first();
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText(body);
  await waitFor(async () => !!(await noteByTitle(page, title)), `native Ink note ${title}`);
  return noteByTitle(page, title);
}

async function editNoteTitle(page, noteId, title) {
  await page.goto(`${base}/#/p/ink?note=${encodeURIComponent(noteId)}`);
  const titleBox = page.getByRole('textbox', { name: 'Note title' });
  await titleBox.waitFor();
  await titleBox.fill(title);
  await titleBox.press('Tab');
}

async function addAssignment(page, title) {
  await page.goto(`${base}/#/`);
  const plan = page.getByRole('region', { name: 'Your next study session' });
  await plan.getByRole('button', { name: 'Paste schedule' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import course schedule' });
  await dialog.getByRole('textbox', { name: 'Paste course schedule' }).fill(`${dateIn(3)} — ${title}`);
  await dialog.getByRole('button', { name: 'Preview assignments' }).click();
  await dialog.getByRole('heading', { name: 'Review assignments' }).waitFor();
  await dialog.getByRole('button', { name: 'Add 1 assignment' }).click();
  await dialog.getByText('1 assignment added.').waitFor();
  await waitFor(async () => !!(await assignmentByTitle(page, title)), `native Planning assignment ${title}`);
  return assignmentByTitle(page, title);
}

async function createCourse(page) {
  await page.goto(`${base}/#/p/syllabus?p=today`);
  await page.getByRole('button', { name: /continue to courses/i }).click();
  await page.getByRole('textbox', { name: 'Course 1 code' }).fill('BIO 215');
  await page.getByRole('textbox', { name: 'Course 1 name' }).fill('Cell Biology');
  await page.getByRole('button', { name: 'Start planning' }).click();
  await waitFor(async () => Object.keys((await nativeState(page, 'syllabus.folio.v1'))?.courses || {}).length > 0, 'native Planning course setup');
}

async function downloadBackup(page, suffix) {
  await page.goto(`${base}/#/settings`);
  await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
  const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
  await page.getByRole('button', { name: /^Download backup/ }).click();
  const download = await downloadPromise;
  const file = path.join(out, `${suffix}-${download.suggestedFilename()}`);
  await download.saveAs(file);
  return { file, backup: JSON.parse(fs.readFileSync(file, 'utf8')) };
}

async function restoreBackup(page, file) {
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: 'Replace everything' }).click();
  await page.waitForLoadState('load');
  await waitFor(async () => !!(await nativeState(page, 'syllabus.folio.v1'))?.courses, 'restored Planning state');
}

function nativeFailureInitScript(targetKey, hookName) {
  return ({ dbName, key, prefix, hook }) => {
    if (sessionStorage.getItem(`${hook}:normal-boot`) === '1') return;
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, ...args) {
      if (this.transaction?.db?.name === dbName && this.name === 'states' && value?.key === key) {
        const pending = Object.keys(localStorage).filter(k => k.startsWith(prefix));
        const injected = sessionStorage.getItem(`${hook}:injected`) === '1';
        const armed = sessionStorage.getItem(`${hook}:armed`) === '1';
        if (armed && pending.length && !injected) {
          sessionStorage.setItem(`${hook}:injected`, '1');
          sessionStorage.setItem(`${hook}:receipt-keys`, JSON.stringify(pending));
          window.__nativeRecoveryInjected = { db: dbName, store: this.name, key, pending };
          try { this.transaction.abort(); } catch { /* transaction can already be completing */ }
          IDBObjectStore.prototype.put = original;
          throw new DOMException('One-shot native state write fault for recovery verification', 'QuotaExceededError');
        }
      }
      return original.call(this, value, ...args);
    };
  };
}

async function armFailure(page, targetKey, hookName) {
  await waitNoReceipts(page, 'clean receipt queue before injected fault');
  await page.addInitScript(nativeFailureInitScript(targetKey, hookName), {
    dbName: nativeDb, key: targetKey, prefix: receiptPrefix, hook: hookName,
  });
  await page.reload();
  await waitNoReceipts(page, 'clean receipt queue after fault hook installation');
  await page.evaluate(hook => sessionStorage.setItem(`${hook}:armed`, '1'), hookName);
}

async function disarmForReload(page, hookName) {
  await page.evaluate(hook => sessionStorage.setItem(`${hook}:normal-boot`, '1'), hookName);
  await page.reload();
}

async function canonicalEntity(page, key) {
  return page.evaluate(key => window.iterra.store.get(key), key);
}

(async () => {
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const errors = [];
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message));
  let peer = null;
  let peerCdp = null;
  let resetPeer = null;
  let resetPeerCdp = null;
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.match(await page.title(), /iterra/i, `${base} must serve the current Iterra candidate`);

    // Seed personal Planning and Ink state through their normal user flows.
    await createCourse(page);
    const a = await addAssignment(page, taskA);
    const note = await createNote(page, noteA, `baseline body ${run}`);
    assert.ok(a?.id && note?.id, 'personal records must be native before backup');
    await waitNoReceipts(page, 'baseline stores to flush');
    const genBeforeBackup = await generation(page);
    assert.equal(typeof genBeforeBackup, 'number', 'native generation metadata must exist');
    const { file: backupFile, backup } = await downloadBackup(page, 'personal');
    const snapFromBackup = backup.idb?.[nativeDb]?.stores?.states?.records || [];
    assert.ok(snapFromBackup.some(row => row.key === 'ink-notes-storage' && row.state?.notes?.some(n => n.id === note.id)), 'backup must capture native Ink state');
    assert.ok(snapFromBackup.some(row => row.key === 'syllabus.folio.v1' && row.state?.commitments?.[a.id]), 'backup must capture native Planning state');

    // Add data after backup; the peer opens this newer state and is frozen.
    const b = await addAssignment(page, taskB);
    const notePostBackup = await createNote(page, noteB, `must disappear on restore ${run}`);
    await waitNoReceipts(page, 'post-backup records to flush');
    assert.ok(b?.id && notePostBackup?.id);

    peer = await ctx.newPage();
    peer.setDefaultTimeout(20000);
    peer.on('pageerror', error => errors.push(`peer: ${error.message}`));
    await peer.goto(`${base}/#/p/ink?note=${encodeURIComponent(note.id)}`);
    await waitFor(async () => (await nativeState(peer, 'ink-notes-storage'))?.notes?.some(n => n.id === notePostBackup.id), 'peer to hydrate post-backup Ink row');
    await peer.goto(`${base}/#/p/syllabus?p=today`);
    await waitFor(async () => (await nativeState(peer, 'syllabus.folio.v1'))?.commitments?.[b.id], 'peer to hydrate post-backup Planning row');
    await waitNoReceipts(peer, 'peer baseline to flush');
    peerCdp = await ctx.newCDPSession(peer);
    await peerCdp.send('Page.setWebLifecycleState', { state: 'frozen' });

    // Restore the real downloaded backup from Settings while the peer retains B.
    await restoreBackup(page, backupFile);
    const genAfterRestore = await generation(page);
    assert.ok(genAfterRestore > genBeforeBackup, `restore must advance generation (${genBeforeBackup} -> ${genAfterRestore})`);
    let restoredInk = await nativeState(page, 'ink-notes-storage');
    let restoredFolio = await nativeState(page, 'syllabus.folio.v1');
    assert.ok(restoredInk.notes.some(n => n.id === note.id));
    assert.ok(!restoredInk.notes.some(n => n.id === notePostBackup.id), 'restore must remove post-backup Ink note');
    assert.ok(restoredFolio.commitments[a.id]);
    assert.ok(!restoredFolio.commitments[b.id], 'restore must remove post-backup Planning assignment');
    const beforeStale = await nativeSnapshot(page);

    // A valid stale-peer action must be rebased or rejected without restoring deleted B.
    await peerCdp.send('Page.setWebLifecycleState', { state: 'active' });
    const staleSeed = await peer.evaluate(({ noteId, assignmentId, title }) => {
      const ink = window.__inkStore?.getState?.();
      const syllabus = window.__syllabusFolioStore?.getState?.();
      const staleHadNote = !!ink?.notes?.some(n => n.id !== noteId && n.title?.includes('post-backup-ink'));
      const staleHadTask = !!syllabus?.commitments?.[assignmentId];
      ink?.updateNote?.(noteId, { title });
      syllabus?.updateCommitment?.(Object.keys(syllabus.commitments || {}).find(id => id !== assignmentId && syllabus.commitments[id]?.title?.includes('personal-assignment')), { detail: 'edited from stale peer' });
      const receipts = Object.keys(localStorage).filter(key => key.startsWith('iterra.native.pending.')).map(storageKey => {
        try { return JSON.parse(localStorage.getItem(storageKey)); } catch { return null; }
      }).filter(Boolean);
      return { staleHadNote, staleHadTask, inkReady: !!ink, syllabusReady: !!syllabus, receipts };
    }, { noteId: note.id, assignmentId: b.id, title: `${run}-stale-peer-title` });
    assert.ok(staleSeed.inkReady && staleSeed.syllabusReady, 'peer must retain live app stores');
    assert.ok(staleSeed.staleHadNote && staleSeed.staleHadTask, 'peer must be stale with both post-backup records before its writes');
    assert.ok(staleSeed.receipts.some(receipt => receipt.key === 'ink-notes-storage' && receipt.generation < genAfterRestore),
      'stale Ink write must carry the pre-restore generation');
    assert.ok(staleSeed.receipts.some(receipt => receipt.key === 'syllabus.folio.v1' && receipt.generation < genAfterRestore),
      'stale Planning write must carry the pre-restore generation');
    await waitNoReceipts(peer, 'stale-generation receipts to be rejected');
    await waitFor(async () => {
      const [inkState, folioState] = await Promise.all([
        nativeState(page, 'ink-notes-storage'), nativeState(page, 'syllabus.folio.v1'),
      ]);
      return !!inkState?.notes?.some(n => n.id === note.id) && !!folioState?.commitments?.[a.id];
    }, 'restored authoritative rows to survive stale peer mutations');
    restoredInk = await nativeState(page, 'ink-notes-storage');
    restoredFolio = await nativeState(page, 'syllabus.folio.v1');
    assert.ok(!restoredInk.notes.some(n => n.id === notePostBackup.id), 'stale Ink snapshot must not resurrect the deleted row');
    assert.ok(!restoredFolio.commitments[b.id], 'stale Planning snapshot must not resurrect the deleted assignment');
    const afterStale = await nativeSnapshot(page);
    assert.equal(afterStale.states.find(row => row.key === 'ink-notes-storage').revision,
      beforeStale.states.find(row => row.key === 'ink-notes-storage').revision, 'stale Ink receipt must not advance restored authority');
    assert.equal(afterStale.states.find(row => row.key === 'syllabus.folio.v1').revision,
      beforeStale.states.find(row => row.key === 'syllabus.folio.v1').revision, 'stale Planning receipt must not advance restored authority');
    assert.equal((await noteByTitle(page, `${run}-stale-peer-title`))?.id, undefined, 'pre-restore Ink edit must be fenced');
    await waitFor(() => canonicalEntity(page, `ink:note:${note.id}`), 'restored Ink canonical mirror');
    await waitFor(() => canonicalEntity(page, `syllabus:commitment:${a.id}`), 'restored Planning canonical mirror');
    assert.ok(await canonicalEntity(page, `ink:note:${note.id}`), 'restored Ink record must remain mirrored canonically');
    assert.ok(await canonicalEntity(page, `syllabus:commitment:${a.id}`), 'restored Planning assignment must remain mirrored canonically');
    await page.reload();
    assert.equal(await generation(page), genAfterRestore, 'reload must honor restore generation');
    restoredInk = await nativeState(page, 'ink-notes-storage');
    restoredFolio = await nativeState(page, 'syllabus.folio.v1');
    assert.ok(restoredInk.notes.some(n => n.id === note.id) && !restoredInk.notes.some(n => n.id === notePostBackup.id));
    assert.ok(restoredFolio.commitments[a.id] && !restoredFolio.commitments[b.id]);

    // Fault one Ink state transaction only after its synchronous receipt is visible.
    await armFailure(page, 'ink-notes-storage', 'native-recovery-ink');
    await page.evaluate(hook => sessionStorage.setItem(`${hook}:armed`, '1'), 'native-recovery-ink');
    await editNoteTitle(page, note.id, receiptEditTitle);
    await waitFor(() => page.evaluate(hook => sessionStorage.getItem(`${hook}:injected`) === '1', 'native-recovery-ink'), 'one injected native Ink failure');
    const faultState = await page.evaluate(hook => ({
      receiptKeys: JSON.parse(sessionStorage.getItem(`${hook}:receipt-keys`) || '[]'),
      pendingKeys: Object.keys(localStorage).filter(key => key.startsWith('iterra.native.pending.')),
    }), 'native-recovery-ink');
    assert.ok(faultState.receiptKeys.length > 0 && faultState.pendingKeys.length > 0, 'failure must occur after durable pending receipt');
    const receiptId = faultState.receiptKeys[0].slice(receiptPrefix.length);
    await disarmForReload(page, 'native-recovery-ink');
    await waitFor(async () => (await noteByTitle(page, receiptEditTitle))?.id === note.id, 'receipt replay to recover edited Ink note');
    const replaySnapshot = await nativeSnapshot(page);
    const replayedReceiptCount = replaySnapshot.applied.filter(row => row.id === receiptId).length;
    assert.equal(replayedReceiptCount, 1, 'the pending Ink receipt must apply exactly once');
    const canonical = await canonicalEntity(page, `ink:note:${note.id}`);
    assert.equal(canonical?.title, receiptEditTitle, 'recovered Ink edit must survive canonical publication');
    await page.reload();
    assert.equal((await nativeSnapshot(page)).applied.filter(row => row.id === receiptId).length, 1, 'subsequent reload must not reapply the same receipt');

    // The next batch verifies atomic failure semantics and durable intake ack.
    // A real Flashcards intake creates due cards; a study-plan intake then proposes
    // multiple Planning blocks against the actual saved assignment.
    const cardsResult = await page.evaluate(async ({ run, assignmentId }) => {
      const course = await window.iterra.courses.resolve({ course: 'BIO 215' });
      return window.iterra.send({ to: 'flashcards', action: 'cards.create', payload: {
        deckTitle: `${run}-due-review`, course: 'BIO 215', courseId: course?.key,
        cards: Array.from({ length: 6 }, (_, i) => ({ q: `${run}-q${i}`, a: `${run}-a${i}` })),
      } });
    }, { run, assignmentId: a.id });
    assert.equal(cardsResult.ok, true, `due-card fixture delivery failed: ${JSON.stringify(cardsResult)}`);
    await page.goto(`${base}/#/p/flashcards`);
    await waitFor(async () => (await page.evaluate(async key => window.iterra.store.list({ app: 'flashcards', type: 'card', courseId: key }),
      await page.evaluate(async () => (await window.iterra.courses.resolve({ course: 'BIO 215' }))?.key)))
      .filter(card => card.title?.includes(`${run}-q`)).length >= 6, 'saved due cards for bulk study plan');
    await waitNoReceipts(page, 'card intake to flush');
    await armFailure(page, 'syllabus.folio.v1', 'native-recovery-bulk');
    await page.goto(`${base}/#/p/syllabus?p=today`);
    const beforeBulk = await nativeState(page, 'syllabus.folio.v1');
    const beforeIds = new Set(Object.keys(beforeBulk.blocks || {}));
    const bulkSend = await page.evaluate(async () => {
      const course = await window.iterra.courses.resolve({ course: 'BIO 215' });
      return window.iterra.send({ to: 'syllabus', action: 'study-plan.request', payload: { courseId: course?.key } });
    });
    await waitFor(() => page.evaluate(hook => sessionStorage.getItem(`${hook}:injected`) === '1', 'native-recovery-bulk'), 'one injected Planning bulk transaction failure');
    const pendingBeforeReplay = await page.evaluate(() => window.iterra.intakes.pending('syllabus'));
    const preReplay = await nativeState(page, 'syllabus.folio.v1');
    const preReplayBlocks = Object.keys(preReplay.blocks || {}).filter(id => !beforeIds.has(id));
    assert.ok(pendingBeforeReplay > 0, 'failed bulk native write must not acknowledge the intake');
    assert.equal(preReplayBlocks.length, 0, 'a failed multi-block write must leave no partial new blocks in authoritative state');
    assert.notEqual(bulkSend.delivered, 'direct', 'failed persistence must not report intake as directly delivered');
    await disarmForReload(page, 'native-recovery-bulk');
    await waitFor(async () => (await page.evaluate(() => window.iterra.intakes.pending('syllabus'))) === 0, 'study-plan intake to complete after native receipt replay', 45000);
    const afterBulk = await nativeState(page, 'syllabus.folio.v1');
    const newBlocks = Object.values(afterBulk.blocks || {}).filter(block =>
      !beforeIds.has(block.id) && block.commitmentId === a.id && block.phase === 'review');
    assert.ok(newBlocks.length > 1, `replayed due-card study plan should persist a whole block batch; got ${newBlocks.length}`);
    assert.equal(new Set(newBlocks.map(block => `${block.plannedDate}|${block.plannedStart}|${block.commitmentId}`)).size, newBlocks.length,
      'intake retry must not duplicate a replayed block batch');

    // Exercise the actual Settings reset while a peer still holds native state.
    await waitNoReceipts(page, 'native receipts before actual reset');
    const generationBeforeReset = await generation(page);
    // The earlier restore peer was activated during the restore checks, so it
    // may have synchronized since. Create a fresh actor immediately before
    // reset and freeze it with the exact pre-wipe projected epochs captured.
    await peer.close();
    peer = null;
    peerCdp = null;
    resetPeer = await ctx.newPage();
    resetPeer.setDefaultTimeout(20000);
    resetPeer.on('pageerror', error => errors.push(`reset peer: ${error.message}`));
    await resetPeer.goto(`${base}/#/p/ink?note=${encodeURIComponent(note.id)}`);
    await resetPeer.waitForFunction(() => !!window.__inkStore?.persist?.hasHydrated?.());
    await resetPeer.goto(`${base}/#/p/syllabus?p=today`);
    await resetPeer.waitForFunction(() => !!window.__syllabusFolioStore?.persist?.hasHydrated?.());
    await waitFor(async () => !!(await nativeState(resetPeer, 'ink-notes-storage'))?.notes?.some(n => n.id === note.id),
      'reset peer to hydrate restored Ink');
    await waitFor(async () => !!(await nativeState(resetPeer, 'syllabus.folio.v1'))?.commitments?.[a.id],
      'reset peer to hydrate restored Planning');
    await waitNoReceipts(resetPeer, 'reset peer baseline to flush');
    const resetPeerEpoch = await projectedEpochs(resetPeer);
    assert.equal(resetPeerEpoch['ink-notes-storage'].generation, generationBeforeReset,
      'reset peer must hold the pre-wipe Ink generation');
    assert.equal(resetPeerEpoch['syllabus.folio.v1'].generation, generationBeforeReset,
      'reset peer must hold the pre-wipe Planning generation');
    resetPeerCdp = await ctx.newCDPSession(resetPeer);
    await resetPeerCdp.send('Page.setWebLifecycleState', { state: 'frozen' });
    await page.goto(`${base}/#/settings`);
    await page.getByRole('button', { name: 'Erase all workspace data' }).click();
    const resetDialog = page.getByRole('dialog', { name: 'Erase everything?' });
    await resetDialog.getByRole('button', { name: 'Erase everything' }).click();
    await page.waitForLoadState('load');
    await waitFor(async () => (await generation(page)) > generationBeforeReset, 'whole-workspace reset to advance native generation');
    const generationAfterReset = await generation(page);
    const dbsAfterReset = await page.evaluate(async () => (await indexedDB.databases()).map(db => db.name));
    assert.ok(dbsAfterReset.includes(nativeDb),
      'actual reset must preserve the native database that carries the monotonic stale-tab fence');
    assert.ok(generationAfterReset > resetPeerEpoch['ink-notes-storage'].generation,
      `reset generation ${generationAfterReset} must remain newer than the frozen pre-wipe peer ${resetPeerEpoch['ink-notes-storage'].generation}`);
    assert.equal(await nativeState(page, 'ink-notes-storage'), null, 'actual reset must clear native Ink state');
    assert.equal(await nativeState(page, 'syllabus.folio.v1'), null, 'actual reset must clear native Planning state');
    await resetPeerCdp.send('Page.setWebLifecycleState', { state: 'active' });
    const staleResetWrite = await resetPeer.evaluate(() => {
      const id = window.__inkStore?.getState?.().addNote({ title: 'stale-after-reset', content: 'old generation' });
      const receipts = Object.keys(localStorage).filter(key => key.startsWith('iterra.native.pending.')).map(storageKey => {
        try { return JSON.parse(localStorage.getItem(storageKey)); } catch { return null; }
      }).filter(Boolean);
      return { id, receipts };
    });
    assert.ok(staleResetWrite.id, 'stale peer attempted an Ink write after reset');
    const resetReceipt = staleResetWrite.receipts.find(receipt => receipt.key === 'ink-notes-storage');
    assert.ok(resetReceipt, 'stale post-reset action must persist a receipt for inspection');
    const resetPeerWasRebased = resetReceipt.generation !== resetPeerEpoch['ink-notes-storage'].generation;
    if (!resetPeerWasRebased) {
      assert.equal(resetReceipt.generation, resetPeerEpoch['ink-notes-storage'].generation,
        'frozen actor receipt must retain its captured pre-wipe epoch');
      assert.ok(resetReceipt.generation < generationAfterReset, 'captured old-generation receipt must be fenced');
      assert.ok(resetReceipt.keyGeneration < generationAfterReset, 'captured old-key-generation receipt must be fenced');
    }
    await waitNoReceipts(resetPeer, 'post-reset peer receipt to settle');
    assert.equal(await nativeState(page, 'ink-notes-storage'), null, 'stale post-reset note must not repopulate native Ink');
    assert.equal(await nativeState(page, 'syllabus.folio.v1'), null, 'stale post-reset write must not repopulate Planning');
    await page.reload();
    assert.equal(await generation(page), generationAfterReset, 'reload must keep the reset generation');
    assert.equal(await nativeState(page, 'ink-notes-storage'), null);
    assert.equal(await nativeState(page, 'syllabus.folio.v1'), null);
    await page.waitForFunction(() => !!window.iterra?.store?.ready, undefined, { timeout: 20000 });
    await page.evaluate(async () => { await window.iterra.store.ready; });
    await waitFor(async () =>
      await canonicalEntity(page, `ink:note:${note.id}`) === null &&
      await canonicalEntity(page, `syllabus:commitment:${a.id}`) === null,
    'actual reset to clear canonical personal records');
    assert.equal(await canonicalEntity(page, `ink:note:${note.id}`), null,
      'actual Settings reset must clear the canonical personal Ink entity');
    assert.equal(await canonicalEntity(page, `syllabus:commitment:${a.id}`), null,
      'actual Settings reset must clear the canonical personal Planning entity');

    const unexpectedErrors = errors.filter(message =>
      !message.includes('One-shot native state write fault for recovery verification') &&
      !message.includes('opened before data was restored'));
    assert.deepEqual(unexpectedErrors, [], `unexpected page errors: ${unexpectedErrors.join(' | ')}`);

    console.log(`PASS backup/restore generation ${genBeforeBackup} -> ${genAfterRestore}; stale peer did not resurrect Ink/Planning rows`);
    console.log(`PASS pending receipt ${receiptId} replayed once; recovered Ink record and canonical entity survived repeated reload`);
    console.log(`PASS failed study-plan bulk write was atomic and remained pending before receipt replay; ${newBlocks.length} blocks landed after retry without duplicates`);
    console.log(`PASS Settings reset generation ${generationBeforeReset} -> ${generationAfterReset}; frozen actor ${resetPeerWasRebased ? 're-based before write' : 'kept its old epoch'} and did not resurrect data after reload`);
  } finally {
    try { if (peerCdp) await peerCdp.send('Page.setWebLifecycleState', { state: 'active' }); } catch { /* closing */ }
    try { if (resetPeerCdp) await resetPeerCdp.send('Page.setWebLifecycleState', { state: 'active' }); } catch { /* closing */ }
    await ctx.close().catch(() => {});
    await browser.close().catch(() => {});
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
