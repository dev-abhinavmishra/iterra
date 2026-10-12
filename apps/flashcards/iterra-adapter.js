/* iterra adapter — flashcards' one door to the canonical store.
   Contract: docs/ADAPTER.md. Vanilla JS twin of the TS adapters. */
(function () {
  var registered = false;
  function registerAdapter() {
    if (registered) return;
    var it = window.iterra;
    if (!it || !it.adapter) return;
    registered = true;
    it.adapter({
      name: 'flashcards',
      title: 'Flashcards',
      summary: function () { return {}; },
      intakes: {},
      wake: function () {},
    });
  }
  if (window.iterra) registerAdapter();
  else window.addEventListener('load', registerAdapter);
})();
