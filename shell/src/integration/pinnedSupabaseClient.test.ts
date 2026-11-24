import { describe, expect, it, vi } from 'vitest';
import { createSupabaseSyncAdapter } from './supabaseSync';
import { createTokenPinnedSupabaseClient } from './pinnedSupabaseClient';

describe('token-pinned Supabase data client', () => {
  it('keeps a write on the verified uid if shared auth switches before fetch dispatch', async () => {
    vi.stubGlobal('WebSocket', class NoopWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
    });
    let currentUid = 'uid-a';
    let requestUrl = '';
    let authorization = '';
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = String(input);
      authorization = new Headers(init?.headers).get('Authorization') || '';
      return new Response(JSON.stringify('applied'), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const pinned = createTokenPinnedSupabaseClient(
      'https://sync-race-test.supabase.co',
      'sb_publishable_test_key',
      'access-token-for-uid-a',
      fetcher,
    );
    const assertIdentity = vi.fn(async () => {
      expect(currentUid).toBe('uid-a');
      // Model an account switch after the guard but before PostgREST dispatch.
      currentUid = 'uid-b';
    });
    const adapter = createSupabaseSyncAdapter(pinned, 'uid-a', { assertIdentity });

    await expect(adapter.put({
      key: 'proof:problem:p1', app: 'proof', type: 'problem', id: 'p1', updatedAt: 1,
    })).resolves.toMatchObject({ status: 'applied' });

    expect(assertIdentity).toHaveBeenCalledTimes(1);
    expect(requestUrl).toContain('/rest/v1/rpc/iterra_entity_put');
    expect(authorization).toBe('Bearer access-token-for-uid-a');
    expect(currentUid).toBe('uid-b');
  });
});
