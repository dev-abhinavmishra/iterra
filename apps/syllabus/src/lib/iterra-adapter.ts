/* iterra adapter — syllabus's one door to the canonical store.
   Contract: docs/ADAPTER.md. Store writes, event emissions, and intake
   handlers for this app all live here. */

declare const window: any;

let registered = false;

export function registerAdapter() {
  if (registered) return;
  const it = window.iterra;
  if (!it?.adapter) return;
  registered = true;
  it.adapter({
    name: 'syllabus',
    title: 'Syllabus',
    summary: () => ({}),
    intakes: {},
    wake: () => {},
  });
}

registerAdapter();
