/* iterra adapter — margin's one door to the canonical store.
   Contract: docs/ADAPTER.md. */

declare const window: any;

let registered = false;

export function registerAdapter() {
  if (registered) return;
  const it = window.iterra;
  if (!it?.adapter) return;
  registered = true;
  it.adapter({
    name: 'margin',
    title: 'Margin',
    summary: () => ({}),
    intakes: {},
    wake: () => {},
  });
}

registerAdapter();
