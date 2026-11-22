/* Replace the sample through each mounted app's public store handle. Native
   Zustand stores persist through the authority middleware; Flashcards uses its
   public save API. The caller waits for receipts and canonical mirrors before
   timing. Never write legacy localStorage projections directly. */
module.exports = async function makeStressFixture(page) {
  return page.evaluate(() => {
    const folioStore = window.__syllabusFolioStore;
    const inkStore = window.__inkStore;
    const flashcards = window.__fcApp;
    const folio = folioStore?.getState?.();
    const ink = inkStore?.getState?.();
    const decks = flashcards?.state?.decks;
    if (!folio || !ink || !flashcards?.createDeck || !flashcards?.newCard || !flashcards?.saveStore ||
        !Object.values(folio.courses || {}).length || !Object.values(folio.commitments || {}).length ||
        !Object.values(decks || {}).length || !ink.notes?.length) throw new Error('Mounted sample app stores are not ready');
    const course = Object.values(folio.courses)[0];
    const commitment = Object.values(folio.commitments)[0];
    const deck = Object.values(decks)[0];
    const note = ink.notes[0];
    const courses = {};
    const commitments = {};
    for (let i = 0; i < 10; i++) {
      const id = `stress-course-${i}`;
      courses[id] = { ...course, id, code: `ST ${100 + i}`, name: `Stress course ${i}` };
    }
    for (let i = 0; i < 200; i++) {
      const id = `stress-commitment-${i}`;
      commitments[id] = { ...commitment, id, courseId: `stress-course-${i % 10}`, title: `Stress commitment ${i}`,
        status: 'open', loggedMinutes: 0, pinned: false };
    }
    // One Zustand update each creates a single native persistence delta and
    // lets the normal adapters reconcile their canonical entities.
    folioStore.setState({ courses, commitments, blocks: {}, links: {}, reviews: {} }, false);
    const notes = Array.from({ length: 500 }, (_, i) => ({ ...note, id: `stress-note-${i}`, title: `Stress note ${i}`,
      course: `ST ${100 + i % 10}`, courseId: `syllabus:course:stress-course-${i % 10}` }));
    inkStore.setState({ notes, activeNoteId: notes[0].id }, false);

    flashcards.state.decks = {};
    for (let i = 0; i < 10; i++) {
      const id = `stress-deck-${i}`;
      const cards = Array.from({ length: 100 }, (_, j) => {
        const card = flashcards.newCard(`Stress question ${i}-${j}`, `Stress answer ${i}-${j}`, '');
        return { ...deck.cards[j % deck.cards.length], ...card, id: `stress-card-${i}-${j}`, q: `Stress question ${i}-${j}`,
          a: `Stress answer ${i}-${j}`, status: 'new' };
      });
      const created = flashcards.createDeck(`Stress deck ${i}`, cards);
      delete flashcards.state.decks[created.id];
      created.id = id;
      created.course = `ST ${100 + i}`;
      created.courseId = `syllabus:course:stress-course-${i}`;
      flashcards.state.decks[id] = created;
    }
    flashcards.saveStore();
    return { courses: Object.keys(courses).length, commitments: Object.keys(commitments).length,
      notes: notes.length, cards: Object.values(flashcards.state.decks).reduce((n, d) => n + d.cards.length, 0) };
  });
};
