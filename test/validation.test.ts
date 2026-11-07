import { describe, expect, it } from 'vitest';
import { parseRequest } from '../src/shared/messages';
import { checkUrl, issuePath, parseConfig, validateConfig } from '../src/shared/validation';
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

describe('sync quotas', () => {
  const longUrls = (count: number) =>
    Array.from({ length: count }, (_, index) => `https://example.com/${'x'.repeat(200)}/${index}`);

  it('rejects a group too large for one sync item, next to its URLs', () => {
    const big = template('Big', longUrls(40));
    const issues = validateConfig(config([big]));
    expect(issues).toEqual([
      expect.objectContaining({ path: issuePath.groupTabs(big.id), severity: 'error' }),
    ]);
  });

  it('rejects a configuration over the total sync quota', () => {
    const groups = Array.from({ length: 20 }, (_, index) => template(`G${index}`, longUrls(25)));
    const issues = validateConfig(config(groups));
    expect(issues).toEqual([
      expect.objectContaining({ path: issuePath.groups(), severity: 'error' }),
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
