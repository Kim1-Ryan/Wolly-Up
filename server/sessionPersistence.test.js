import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sessionProfile } from './tokens.js';

test('session restoration loads the profile in one authenticated query', async () => {
  const profile = { id: 'owner' };
  let queries = 0;
  const pool = { query: async (sql, parameters) => {
    queries++;
    assert.match(sql, /JOIN profiles/);
    assert.match(sql, /s.expires_at > NOW\(\)/);
    assert.equal(parameters[0], createHash('sha256').update('valid-session').digest('hex'));
    return { rows: [profile] };
  } };
  assert.equal(await sessionProfile({ headers: {} }, pool), null);
  assert.equal(queries, 0);
  assert.equal(await sessionProfile({ headers: { authorization: 'Bearer valid-session' } }, pool), profile);
  assert.equal(queries, 1);
  assert.equal(await sessionProfile({ headers: { authorization: 'Bearer invalid' } }, { query: async () => ({ rows: [] }) }), null);
});

test('sign-in survives a fresh page load and logout clears it', async () => {
  const values = new Map();
  const previousStorage = globalThis.localStorage;
  const previousFetch = globalThis.fetch;
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  const requests = [];
  globalThis.fetch = async (path, options) => { requests.push({ path, options }); return { ok: true }; };
  try {
    const firstLoad = await import('../src/api.js?first-load');
    firstLoad.setApiSession('saved-session');
    const refreshedPage = await import('../src/api.js?refreshed-page');
    assert.equal(refreshedPage.getSavedSession(), 'saved-session');
    await refreshedPage.apiFetch('/api/auth/session');
    assert.equal(requests.at(-1).options.headers.get('Authorization'), 'Bearer saved-session');
    refreshedPage.setApiSession(null);
    assert.equal(refreshedPage.getSavedSession(), null);
    await refreshedPage.apiFetch('/api/auth/session');
    assert.equal(requests.at(-1).options?.headers?.get('Authorization'), undefined);
    const afterLogout = await import('../src/api.js?after-logout');
    assert.equal(afterLogout.getSavedSession(), null);
  } finally {
    globalThis.localStorage = previousStorage;
    globalThis.fetch = previousFetch;
  }
});

test('sign-in works in memory when browser storage is blocked', async () => {
  const previousStorage = globalThis.localStorage;
  const previousFetch = globalThis.fetch;
  globalThis.localStorage = {
    getItem() { throw new Error('Storage blocked'); },
    setItem() { throw new Error('Storage blocked'); },
    removeItem() { throw new Error('Storage blocked'); },
  };
  let authorization;
  globalThis.fetch = async (_path, options) => { authorization = options?.headers?.get('Authorization'); return { ok: true }; };
  try {
    const api = await import('../src/api.js?blocked-storage');
    assert.equal(api.getSavedSession(), null);
    api.setApiSession('memory-session');
    await api.apiFetch('/api/auth/session');
    assert.equal(authorization, 'Bearer memory-session');
    api.setApiSession(null);
    await api.apiFetch('/api/auth/session');
    assert.equal(authorization, undefined);
  } finally {
    globalThis.localStorage = previousStorage;
    globalThis.fetch = previousFetch;
  }
});
