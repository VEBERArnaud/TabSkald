import { describe, expect, it } from 'vitest';
import { loadConfig, migrateLegacyConfig, saveConfig } from '../src/background/storage';
import { MemoryStore } from './fakeChrome';
import { config, storeConfig, template } from './helpers';

function stores() {
  return { sync: new MemoryStore(), local: new MemoryStore() };
}

describe('configuration storage', () => {
  it('returns an empty configuration on first use without writing anything', async () => {
    const { sync, local } = stores();
    const load = await loadConfig({ sync, local });
    expect(load).toEqual({
      ok: true,
      config: { schemaVersion: 1, autoLaunchEnabled: true, groups: [] },
      issues: [],
    });
    expect(sync.data.size).toBe(0);
    expect(local.data.size).toBe(0);
  });

  it('stores settings and each group under its own sync key', async () => {
    const s = stores();
    const a = template('A', ['https://a.test/']);
    const b = template('B', ['https://b.test/']);
    await saveConfig(s, config([a, b], false));
    expect([...s.sync.data.keys()].sort()).toEqual(['group:' + a.id, 'group:' + b.id, 'settings']);
    expect(s.sync.data.get('settings')).toEqual({
      schemaVersion: 1,
      autoLaunchEnabled: false,
      groupIds: [a.id, b.id],
    });
  });

  it('persists a valid configuration, trimmed, and reads it back in order', async () => {
    const s = stores();
    const a = template('  Projet  ', ['  https://a.test/x?y=1#z  ']);
    const b = template('B', ['https://b.test/']);
    expect((await saveConfig(s, config([b, a]))).ok).toBe(true);
    const load = await loadConfig(s);
    expect(load.ok && load.config.groups.map((group) => group.name)).toEqual(['B', 'Projet']);
    expect(load.ok && load.config.groups[1]?.tabs).toEqual([
      { id: a.tabs[0]?.id, url: 'https://a.test/x?y=1#z' },
    ]);
  });

  it('removes the keys of deleted groups', async () => {
    const s = stores();
    const a = template('A', ['https://a.test/']);
    const b = template('B', ['https://b.test/']);
    await saveConfig(s, config([a, b]));
    await saveConfig(s, config([b]));
    expect(s.sync.data.has('group:' + a.id)).toBe(false);
    expect(s.sync.data.has('group:' + b.id)).toBe(true);
  });

  it('refuses to save invalid data and keeps the previous configuration', async () => {
    const s = stores();
    const previous = config([template('A', ['https://a.test/'])]);
    await saveConfig(s, previous);
    const before = new Map(s.sync.data);
    const saved = await saveConfig(s, config([template('B', ['ftp://b.test/'])]));
    expect(saved.ok).toBe(false);
    expect(s.sync.data).toEqual(before);
  });

  it('reports a rejected sync write instead of throwing', async () => {
    const s = stores();
    s.sync.writeError = new Error('MAX_WRITE_OPERATIONS_PER_MINUTE quota exceeded');
    const saved = await saveConfig(s, config([template('A', ['https://a.test/'])]));
    expect(saved).toEqual({
      ok: false,
      error: expect.stringContaining('réessayez dans une minute') as unknown,
      issues: [],
    });
  });

  it('never erases an unreadable stored configuration', async () => {
    const s = stores();
    const broken = { schemaVersion: 1, groupIds: 'oops' };
    s.sync.data.set('settings', broken);
    const load = await loadConfig(s);
    expect(load.ok).toBe(false);
    if (!load.ok) expect(load.raw).toEqual(broken);
    expect(s.sync.data.get('settings')).toEqual(broken);
  });

  it('leaves out a group whose key has not been received yet', async () => {
    const s = stores();
    const a = template('A', ['https://a.test/']);
    const b = template('B', ['https://b.test/']);
    storeConfig(s.sync, config([a, b]));
    s.sync.data.delete('group:' + a.id);
    const load = await loadConfig(s);
    expect(load.ok && load.config.groups.map((group) => group.id)).toEqual([b.id]);
  });
});

describe('configuration stored before synchronization', () => {
  it('is still read from storage.local while sync is empty', async () => {
    const s = stores();
    const legacy = config([template('A', ['https://a.test/'])]);
    s.local.data.set('config', legacy);
    expect(await loadConfig(s)).toMatchObject({ ok: true, config: legacy });
  });

  it('is moved to storage.sync on migration', async () => {
    const s = stores();
    const legacy = config([template('A', ['https://a.test/'])], false);
    s.local.data.set('config', legacy);
    await migrateLegacyConfig(s);
    expect(s.local.data.has('config')).toBe(false);
    expect(await loadConfig(s)).toMatchObject({ ok: true, config: legacy });
  });

  it('is ignored when sync already holds a configuration from another computer', async () => {
    const s = stores();
    const synced = config([template('Synced', ['https://s.test/'])]);
    storeConfig(s.sync, synced);
    s.local.data.set('config', config([template('Local', ['https://l.test/'])]));
    await migrateLegacyConfig(s);
    expect(await loadConfig(s)).toMatchObject({ ok: true, config: synced });
  });

  it('stays in place when it cannot be read', async () => {
    const s = stores();
    s.local.data.set('config', { schemaVersion: 1 });
    await migrateLegacyConfig(s);
    expect(s.local.data.get('config')).toEqual({ schemaVersion: 1 });
    expect(s.sync.data.size).toBe(0);
  });
});
