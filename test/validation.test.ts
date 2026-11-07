import { describe, expect, it } from 'vitest';
import { loadConfig, saveConfig } from '../src/background/storage';
import { parseRequest } from '../src/shared/messages';
import { checkUrl, issuePath, parseConfig, validateConfig } from '../src/shared/validation';
import { MemoryStore } from './fakeChrome';
import { config, template } from './helpers';

describe('checkUrl', () => {
  it.each([
    'https://github.com',
    'http://localhost:5173/app',
    'https://example.com:8443/path?q=1&r=2#section',
    'http://127.0.0.1:3000',
  ])('accepts %s', (url) => {
    expect(checkUrl(url)).toEqual({ ok: true, url });
  });

  it('trims outer whitespace without rewriting the URL', () => {
    expect(checkUrl('  https://Example.com/a?b=1#c \n')).toEqual({
      ok: true,
      url: 'https://Example.com/a?b=1#c',
    });
  });

  it.each([
    ['chrome://settings', 'chrome:'],
    ['file:///etc/hosts', 'file:'],
    ['javascript:alert(1)', 'javascript:'],
    ['ftp://example.com', 'ftp:'],
  ])('rejects %s with an explicit protocol message', (url, protocol) => {
    const result = checkUrl(url);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain(protocol);
  });

  it('rejects empty and relative values', () => {
    expect(checkUrl('   ').ok).toBe(false);
    expect(checkUrl('github.com').ok).toBe(false);
  });
});

describe('validateConfig', () => {
  it('requires a name and valid URLs, reported next to each field', () => {
    const tpl = template(' ', ['https://ok.test/', 'notaurl']);
    const issues = validateConfig(config([tpl]));
    expect(issues.map((issue) => [issue.path, issue.severity])).toEqual([
      [issuePath.groupName(tpl.id), 'error'],
      [issuePath.tab(tpl.id, tpl.tabs[1]?.id ?? ''), 'error'],
    ]);
  });

  it('requires at least one URL for a group opened at startup', () => {
    const startup = template('A', []);
    const manual = template('B', [], { openOnStartup: false });
    const issues = validateConfig(config([startup, manual]));
    expect(issues).toEqual([
      expect.objectContaining({ path: issuePath.groupTabs(startup.id), severity: 'error' }),
    ]);
  });

  it('warns about a URL repeated in the same template, but not across templates', () => {
    const a = template('A', ['https://github.com/', ' https://github.com/ ']);
    const b = template('B', ['https://github.com/']);
    const issues = validateConfig(config([a, b]));
    expect(issues).toEqual([
      expect.objectContaining({
        path: issuePath.tab(a.id, a.tabs[1]?.id ?? ''),
        severity: 'warning',
      }),
    ]);
  });
});

describe('parseConfig', () => {
  it('accepts a valid configuration', () => {
    const value = config([template('A', ['https://a.test/'])]);
    expect(parseConfig(value)).toEqual({ ok: true, value });
  });

  it.each([
    [null, 'mal formée'],
    [{ schemaVersion: 2, autoLaunchEnabled: true, groups: [] }, 'Version'],
    [{ schemaVersion: 1, autoLaunchEnabled: 'yes', groups: [] }, 'automatique'],
    [
      {
        schemaVersion: 1,
        autoLaunchEnabled: true,
        groups: [
          { id: 'a', name: 'A', color: 'black', collapsed: false, openOnStartup: true, tabs: [] },
        ],
      },
      'couleur',
    ],
  ])('rejects malformed data with a readable message', (raw, expected) => {
    const result = parseConfig(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(expected);
  });

  it('rejects duplicated template ids', () => {
    const tpl = template('A', ['https://a.test/']);
    expect(parseConfig(config([tpl, { ...tpl }])).ok).toBe(false);
  });
});

describe('configuration storage', () => {
  it('returns an empty configuration on first use without writing anything', async () => {
    const local = new MemoryStore();
    const load = await loadConfig(local);
    expect(load).toEqual({
      ok: true,
      config: { schemaVersion: 1, autoLaunchEnabled: true, groups: [] },
      issues: [],
    });
    expect(local.data.size).toBe(0);
  });

  it('persists a valid configuration, trimmed, and reads it back unchanged', async () => {
    const local = new MemoryStore();
    const tpl = template('  Projet  ', ['  https://a.test/x?y=1#z  ']);
    const saved = await saveConfig(local, config([tpl]));
    expect(saved.ok).toBe(true);
    const load = await loadConfig(local);
    expect(load.ok && load.config.groups[0]).toMatchObject({
      name: 'Projet',
      tabs: [{ url: 'https://a.test/x?y=1#z' }],
    });
  });

  it('refuses to save invalid data and keeps the previous configuration', async () => {
    const local = new MemoryStore();
    const previous = config([template('A', ['https://a.test/'])]);
    await saveConfig(local, previous);
    const saved = await saveConfig(local, config([template('B', ['ftp://b.test/'])]));
    expect(saved.ok).toBe(false);
    expect(local.data.get('config')).toEqual(previous);
  });

  it('never erases an unreadable stored configuration', async () => {
    const local = new MemoryStore();
    const broken = { schemaVersion: 1, groups: 'oops' };
    local.data.set('config', broken);
    const load = await loadConfig(local);
    expect(load.ok).toBe(false);
    if (!load.ok) expect(load.raw).toEqual(broken);
    expect(local.data.get('config')).toEqual(broken);
  });
});

describe('parseRequest', () => {
  it('accepts well-formed messages', () => {
    expect(parseRequest({ type: 'getState' })).toEqual({ type: 'getState' });
    expect(parseRequest({ type: 'openGroup', windowId: 3, templateId: 'a' })).toEqual({
      type: 'openGroup',
      windowId: 3,
      templateId: 'a',
    });
    expect(parseRequest({ type: 'setAutoLaunch', enabled: false })).toEqual({
      type: 'setAutoLaunch',
      enabled: false,
    });
  });

  it.each([
    undefined,
    'getState',
    { type: 'unknown' },
    { type: 'openGroup', windowId: '3', templateId: 'a' },
    { type: 'openStartupGroups', windowId: -1 },
    { type: 'setAutoLaunch', enabled: 'true' },
    { type: 'saveGroups', groups: [{ id: 'a' }] },
  ])('rejects %j', (message) => {
    expect(parseRequest(message)).toBeUndefined();
  });
});
