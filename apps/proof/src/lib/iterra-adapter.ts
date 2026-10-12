/* iterra adapter — proof's one door to the canonical store.
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
    name: 'proof',
    title: 'Proof',
    summary: () => ({}),
    intakes: {},
    wake: () => {},
  });
}

registerAdapter();
