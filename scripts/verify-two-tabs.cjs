/* Isolated two-tab native-store durability regression. Run against a local
   release candidate only:
   $env:ITERRA_BASE='http://127.0.0.1:PORT'; node scripts/verify-two-tabs.cjs
   Uses public Zustand persistence APIs and the canonical Iterra store. */
const { chromium } = require('../node_modules/playwright-core');
const { existsSync } = require('node:fs');
const assert = require('node:assert/strict');
const origin = process.env.ITERRA_BASE;
if (!origin) throw Error('Set ITERRA_BASE to the local release server.');
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);

const waitStore = (page, globalName) => page.waitForFunction(name => {
  const s = window[name];
  return !!s?.persist?.hasHydrated?.() && typeof s.getState === 'function';
}, globalName);

async function goBothPlaces(page) {
  await page.goto(origin + '/#/p/ink');
  await waitStore(page, '__inkStore');
  await page.goto(origin + '/#/p/syllabus?p=today');
  await waitStore(page, '__syllabusFolioStore');
  await page.evaluate(async () => { await window.iterra?.store?.ready; });
}

async function stored(page, key, path) {
  return page.evaluate(([storageKey, field]) => {
    const raw = JSON.parse(localStorage.getItem(storageKey) || 'null');
    return raw?.state?.[field] ?? null;
  }, [key, path]);
}

async function nativeFolio(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('iterra-native-state', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const row = await new Promise((resolve, reject) => {
      const tx = db.transaction('states', 'readonly');
      const request = tx.objectStore('states').get('syllabus.folio.v1');
      tx.oncomplete = () => resolve(request.result ?? null);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
    db.close();
    return row;
  });
}

async function canonical(page, key) {
  return page.evaluate(async entityKey => await window.iterra.store.get(entityKey), key);
}

async function waitNativeDurable(page) {
  await page.waitForFunction(async () => {
    const pending = Object.keys(localStorage).some(key => key.startsWith('iterra.native.pending.'));
    if (pending) return false;
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('iterra-native-state', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('native state DB open is blocked'));
    }).catch(() => null);
    if (!db || !db.objectStoreNames.contains('states') || !db.objectStoreNames.contains('meta')) {
      db?.close();
      return false;
    }
    const snapshot = await new Promise(resolve => {
      const tx = db.transaction(['states', 'meta'], 'readonly');
      const rowsReq = tx.objectStore('states').getAll();
      const metaReq = tx.objectStore('meta').getAll();
      tx.oncomplete = () => resolve({ rows: rowsReq.result, meta: metaReq.result });
      tx.onerror = tx.onabort = () => resolve(null);
    });
    db.close();
    if (!snapshot) return false;
    const rows = new Map(snapshot.rows.map(row => [row.key, row]));
    const meta = new Map(snapshot.meta.map(entry => [entry.key, entry.value]));
    for (const key of ['ink-notes-storage', 'syllabus.folio.v1']) {
      const row = rows.get(key);
      if (!row) continue;
      const projection = JSON.parse(localStorage.getItem(key) || 'null');
      if (!projection || projection.__nativeRevision !== row.revision ||
          projection.__nativeGeneration !== (meta.get('generation') ?? 1) ||
          projection.__nativeKeyGeneration !== (meta.get(`generation:${key}`) ?? 1)) return false;
    }
    return true;
  }, { timeout: 20000 });
}

(async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const context = await browser.newContext();
    const [left, right] = await Promise.all([context.newPage(), context.newPage()]);
    for (const page of [left, right]) page.setDefaultTimeout(15000);

    await goBothPlaces(left);
    const prefix = `two-tab-${Date.now()}`;
    const setup = await left.evaluate(() => {
      const store = window.__syllabusFolioStore;
      const now = new Date();
      const startDate = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
      const endDate = new Date(now.getTime() + 86400000 * 180).toISOString().slice(0, 10);
      const term = store.getState().createTerm({ name: 'Two-tab QA term', startDate, endDate, timezone: 'America/Chicago' });
      const course = store.getState().addCourse({ name: 'Two-tab QA course', code: 'TABSQA', color: 'teal', termId: term.id });
      return { termId: term.id, courseId: course.id };
    });
    const immediate = await left.evaluate(async ({ courseId }) => {
      const receipt = Object.keys(localStorage).filter(key => key.startsWith('iterra.native.pending.'))
        .map(key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } })
        .filter(Boolean).some(item => item.key === 'syllabus.folio.v1' &&
          item.operations.some(op => op.field === 'courses' && op.id === courseId));
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('iterra-native-state', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const row = await new Promise((resolve, reject) => {
        const tx = db.transaction('states', 'readonly');
        const request = tx.objectStore('states').get('syllabus.folio.v1');
        tx.oncomplete = () => resolve(request.result ?? null);
        tx.onerror = tx.onabort = () => reject(tx.error);
      });
      db.close();
      return { receipt, nativeCourse: row?.state?.courses?.[courseId] ?? null,
        liveCourse: window.__syllabusFolioStore.getState().courses[courseId] ?? null };
    }, setup);
    assert.ok(immediate.liveCourse, 'course mutation returns with a live record');
    assert.ok(immediate.receipt || immediate.nativeCourse,
      'course mutation returns only after a synchronous receipt or committed native row exists');
    await waitNativeDurable(left);
    const initialAuthority = await nativeFolio(left);
    assert.equal(initialAuthority?.state?.courses?.[setup.courseId]?.code, 'TABSQA',
      'setup course must be in authoritative native state before opening the second tab');
    await left.waitForFunction(() => {
      const state = window.__syllabusFolioStore?.getState?.();
      return !!state && Object.values(state.courses || {}).some(course => course.code === 'TABSQA');
    });

    await goBothPlaces(right);
    await waitNativeDurable(left);
    const afterSecondTab = await nativeFolio(left);
    assert.equal(afterSecondTab?.state?.courses?.[setup.courseId]?.code, 'TABSQA',
      'second-tab startup must not delete the hydrated course');
    // Reload both after fixture setup, then revisit both places in each tab so
    // both native stores start each write race from the same hydrated state.
    await Promise.all([left.reload(), right.reload()]);
    await Promise.all([goBothPlaces(left), goBothPlaces(right)]);
    const fixture = await left.evaluate(() => {
      const course = Object.values(window.__syllabusFolioStore.getState().courses).find(c => c.code === 'TABSQA');
      if (!course) throw new Error('fixture course did not survive reload');
      return { courseId: course.id };
    });
    await right.waitForFunction(code => Object.values(window.__syllabusFolioStore.getState().courses).some(c => c.id === code), fixture.courseId);

    const fixtures = await left.evaluate(({ prefix }) => {
      const contentFor = text => JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
      const ink = window.__inkStore.getState();
      const syllabus = window.__syllabusFolioStore.getState();
      const course = Object.values(syllabus.courses).find(c => c.code === 'TABSQA');
      if (!course) throw new Error('fixture course missing before baseline');
      const items = [0, 1].map(index => {
        const noteId = `${prefix}-baseline-note-${index}`;
        const taskTitle = `${prefix} baseline task ${index}`;
        ink.addNote({ id: noteId, title: `${prefix} baseline note ${index}`, content: contentFor(`Original baseline text ${index}`) });
        const task = syllabus.addCommitment({
          courseId: course.id, type: 'assignment', title: taskTitle,
          dueAt: new Date(Date.now() + (index + 2) * 86400000).toISOString(), weight: 0, estimatedMinutes: 30,
        });
        return { noteId, commitmentId: task.id };
      });
      return { items, courseId: course.id };
    }, { prefix });
    await waitNativeDurable(left);
    await left.reload();
    await right.goto(origin + '/#/p/ink');
    await waitStore(right, '__inkStore');
    await right.goto(origin + '/#/p/syllabus?p=today');
    await waitStore(right, '__syllabusFolioStore');
    await Promise.all([left.reload(), right.reload()]);
    await Promise.all([goBothPlaces(left), goBothPlaces(right)]);
    await Promise.all([left, right].map((page, index) => page.waitForFunction(({ noteId, commitmentId }) => {
      const notes = window.__inkStore.getState().notes;
      const commitments = window.__syllabusFolioStore.getState().commitments;
      return notes.some(n => n.id === noteId) && !!commitments[commitmentId];
    }, { noteId: fixtures.items[index].noteId, commitmentId: fixtures.items[index].commitmentId })));

    const records = await Promise.all([left, right].map((page, index) => page.evaluate(async ({ prefix, index, courseId, baseline }) => {
      const noteId = `${prefix}-note-${index}`;
      const title = `Two-tab note ${index}`;
      const text = `Independent note body from tab ${index}, retained word-for-word.`;
      const content = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
      const editTitle = `Edited baseline note ${index}`;
      const editText = `Edited baseline note body from tab ${index}, retained word-for-word.`;
      const editContent = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: editText }] }] });
      const commitmentTitle = `Two-tab task ${index}`;
      const editCommitmentTitle = `Edited baseline task ${index}`;
      const dueAt = new Date(Date.now() + (index + 1) * 86400000).toISOString();
      // Two independent pages execute this immediately after the same short
      // barrier. Their persist snapshots are deliberately both hydrated first.
      await new Promise(resolve => setTimeout(resolve, 30));
      window.__inkStore.getState().updateNote(baseline.noteId, { title: editTitle, content: editContent });
      window.__inkStore.getState().addNote({ id: noteId, title, content });
      window.__syllabusFolioStore.getState().updateCommitment(baseline.commitmentId, { title: editCommitmentTitle });
      const commitment = window.__syllabusFolioStore.getState().addCommitment({
        courseId, type: 'assignment', title: commitmentTitle, dueAt,
        weight: 0, estimatedMinutes: 45,
      });
      return { noteId, title, text, content, commitmentId: commitment.id, commitmentTitle,
        editNoteId: baseline.noteId, editTitle, editText, editContent,
        editCommitmentId: baseline.commitmentId, editCommitmentTitle };
    }, { prefix, index, courseId: fixtures.courseId, baseline: fixtures.items[index] })));

    await Promise.all([waitNativeDurable(left), waitNativeDurable(right)]);

    const verifyNative = async page => {
      const notes = await stored(page, 'ink-notes-storage', 'notes');
      const commitments = await stored(page, 'syllabus.folio.v1', 'commitments');
      for (const r of records) {
        const note = notes?.find(n => n.id === r.noteId);
        assert.ok(note, `native Ink record ${r.noteId} persisted`);
        assert.equal(note.title, r.title);
        assert.equal(note.content, r.content);
        const task = commitments?.[r.commitmentId];
        assert.ok(task, `native Planning record ${r.commitmentId} persisted`);
        assert.equal(task.title, r.commitmentTitle);
        const editedNote = notes?.find(n => n.id === r.editNoteId);
        assert.ok(editedNote, `edited native Ink record ${r.editNoteId} persisted`);
        assert.equal(editedNote.title, r.editTitle);
        assert.equal(editedNote.content, r.editContent);
        assert.equal(commitments?.[r.editCommitmentId]?.title, r.editCommitmentTitle);
      }
    };
    const nativeIds = await left.evaluate(() => {
      const notes = JSON.parse(localStorage.getItem('ink-notes-storage') || 'null')?.state?.notes || [];
      const commitments = JSON.parse(localStorage.getItem('syllabus.folio.v1') || 'null')?.state?.commitments || {};
      return { noteIds: notes.map(n => n.id), commitmentIds: Object.keys(commitments),
        noteTitles: notes.map(n => ({ id: n.id, title: n.title })),
        taskTitles: Object.fromEntries(Object.entries(commitments).map(([id, c]) => [id, c.title])) };
    });
    const expectedNotes = records.flatMap(r => [r.noteId, r.editNoteId]);
    const expectedCommitments = records.flatMap(r => [r.commitmentId, r.editCommitmentId]);
    const missingNotes = expectedNotes.filter(id => !nativeIds.noteIds.includes(id));
    const missingCommitments = expectedCommitments.filter(id => !nativeIds.commitmentIds.includes(id));
    if (missingNotes.length || missingCommitments.length) {
      console.error('TWO_TAB_NATIVE_SNAPSHOT', JSON.stringify({ missingNotes, missingCommitments, ...nativeIds }));
      assert.fail('A concurrent distinct-record change was lost from native persisted state');
    }
    await verifyNative(left);
    for (let index = 0; index < records.length; index++) {
      const page = index === 0 ? left : right;
      assert.equal(await page.evaluate(() => window.__inkStore.getState().activeNoteId), records[index].noteId,
        `tab ${index} keeps its own selected note after the other tab commits`);
    }

    await left.waitForFunction(async expected => {
      const store = window.iterra?.store;
      if (!store) return false;
      const checks = expected.flatMap(r => [
        { key: `ink:note:${r.noteId}`, title: r.title, sub: r.text },
        { key: `ink:note:${r.editNoteId}`, title: r.editTitle, sub: r.editText },
        { key: `syllabus:commitment:${r.commitmentId}`, title: r.commitmentTitle },
        { key: `syllabus:commitment:${r.editCommitmentId}`, title: r.editCommitmentTitle },
      ]);
      const entities = await Promise.all(checks.map(check => store.get(check.key)));
      return entities.every((entity, i) => entity?.title === checks[i].title &&
        (checks[i].sub === undefined || entity.sub === checks[i].sub));
    }, records);
    for (const r of records) {
      const note = await canonical(left, `ink:note:${r.noteId}`);
      assert.equal(note?.id, r.noteId);
      assert.equal(note?.title, r.title);
      assert.equal(note?.sub, r.text);
      const task = await canonical(left, `syllabus:commitment:${r.commitmentId}`);
      assert.equal(task?.id, r.commitmentId);
      assert.equal(task?.title, r.commitmentTitle);
      const editedNote = await canonical(left, `ink:note:${r.editNoteId}`);
      assert.equal(editedNote?.id, r.editNoteId);
      assert.equal(editedNote?.title, r.editTitle);
      assert.equal(editedNote?.sub, r.editText);
      const editedTask = await canonical(left, `syllabus:commitment:${r.editCommitmentId}`);
      assert.equal(editedTask?.id, r.editCommitmentId);
      assert.equal(editedTask?.title, r.editCommitmentTitle);
    }

    await Promise.all([left.reload(), right.reload()]);
    await Promise.all([goBothPlaces(left), goBothPlaces(right)]);
    await Promise.all([waitNativeDurable(left), waitNativeDurable(right)]);
    await verifyNative(left);
    await verifyNative(right);
    for (let index = 0; index < records.length; index++) {
      const page = index === 0 ? left : right;
      assert.equal(await page.evaluate(() => window.__inkStore.getState().activeNoteId), records[index].noteId,
        `tab ${index} restores its own selected note after reload`);
    }
    for (const r of records) {
      for (const id of [r.noteId, r.editNoteId]) {
        const note = await canonical(left, `ink:note:${id}`);
        assert.equal(note?.id, id);
        assert.equal(note?.title, id === r.noteId ? r.title : r.editTitle);
        assert.equal(note?.sub, id === r.noteId ? r.text : r.editText);
      }
      for (const id of [r.commitmentId, r.editCommitmentId]) {
        const task = await canonical(left, `syllabus:commitment:${id}`);
        assert.equal(task?.id, id);
        assert.equal(task?.title, id === r.commitmentId ? r.commitmentTitle : r.editCommitmentTitle);
      }
    }
    console.log('PASS two-tab Ink and Planning native plus canonical durability across reload');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
