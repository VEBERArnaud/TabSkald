import { describe, expect, it } from 'vitest';
import { handleRequest } from '../src/background/handlers';
import type { OpenGroupSummary } from '../src/shared/messages';
import { buildImportDraft, DEFAULT_IMPORTED_NAME } from '../src/shared/importDraft';
import { config, setup, template } from './helpers';

describe('buildImportDraft', () => {
  it('copies name, color, collapsed state and URLs in order', () => {
    const draft = buildImportDraft({
      title: 'Projet 1',
      color: 'green',
      collapsed: true,
      urls: ['https://b.test/', 'https://a.test/?q=1#x'],
    });
    expect(draft.unsupported).toEqual([]);
    expect(draft.template).toMatchObject({
      name: 'Projet 1',
      color: 'green',
      collapsed: true,
      openOnStartup: false,
      tabs: [{ url: 'https://b.test/' }, { url: 'https://a.test/?q=1#x' }],
    });
  });

  it('reports unsupported URLs instead of dropping them silently', () => {
    const draft = buildImportDraft({
      title: '',
      color: 'blue',
      collapsed: false,
      urls: ['chrome://extensions/', 'https://ok.test/', 'file:///tmp/a.html'],
    });
    expect(draft.template.name).toBe(DEFAULT_IMPORTED_NAME);
    expect(draft.template.tabs.map((tab) => tab.url)).toEqual(['https://ok.test/']);
    expect(draft.unsupported.map((item) => item.url)).toEqual([
      'chrome://extensions/',
      'file:///tmp/a.html',
    ]);
  });

  it('produces fresh stable ids', () => {
    const group = { title: 'A', color: 'red', collapsed: false, urls: ['https://a.test/'] };
    expect(buildImportDraft(group).template.id).not.toBe(buildImportDraft(group).template.id);
  });
});

describe('importing an open group through the service worker', () => {
  it('lists open groups of normal windows with their URLs in tab order, including pending ones', async () => {
    const deps = setup([]);
    const windowId = deps.browser.addWindow();
    const incognito = deps.browser.addWindow({ incognito: true });
    deps.browser.addTab(windowId, 'https://loose.test/');
    const groupId = deps.browser.addGroup(
      windowId,
      { title: 'Projet', color: 'cyan', collapsed: true },
      ['https://a.test/', 'chrome://settings/'],
    );
    deps.browser.addGroup(incognito, { title: 'Privé', color: 'red', collapsed: false }, [
      'https://x.test/',
    ]);
    await deps.browser
      .createTab(windowId, 'https://pending.test/')
      .then((tab) => deps.browser.groupTabs(windowId, [tab.id]));

    const response = await handleRequest(deps, { type: 'listOpenGroups' });

    expect(response.ok).toBe(true);
    const groups = (response.ok ? response.data : []) as OpenGroupSummary[];
    expect(groups.map((g) => g.title)).toEqual(['Projet', '']);
    expect(groups[0]).toEqual({
      groupId,
      windowId,
      title: 'Projet',
      color: 'cyan',
      collapsed: true,
      urls: ['https://a.test/', 'chrome://settings/'],
    });
    expect(groups[1]?.urls).toEqual(['https://pending.test/']);
  });

  it('saves an imported template like any other, with no link to the original group', async () => {
    const existing = template('A', ['https://a.test/']);
    const deps = setup([existing]);
    const windowId = deps.browser.addWindow();
    const groupId = deps.browser.addGroup(
      windowId,
      { title: 'Importé', color: 'pink', collapsed: false },
      ['https://i.test/'],
    );
    const draft = buildImportDraft({
      title: 'Importé',
      color: 'pink',
      collapsed: false,
      urls: ['https://i.test/'],
    });

    const saved = await handleRequest(deps, {
      type: 'saveGroups',
      groups: [existing, draft.template],
    });
    expect(saved.ok).toBe(true);

    deps.browser.closeGroup(groupId);
    expect(deps.local.data.get('config')).toEqual(config([existing, draft.template]));
  });
});

describe('settings messages', () => {
  it('keeps the global switch when saving groups', async () => {
    const deps = setup([], { autoLaunchEnabled: false });
    await handleRequest(deps, { type: 'saveGroups', groups: [template('A', ['https://a.test/'])] });
    expect(deps.local.data.get('config')).toMatchObject({ autoLaunchEnabled: false });
  });

  it('toggles automatic opening', async () => {
    const deps = setup([template('A', ['https://a.test/'])]);
    const response = await handleRequest(deps, { type: 'setAutoLaunch', enabled: false });
    expect(response.ok).toBe(true);
    expect(deps.local.data.get('config')).toMatchObject({ autoLaunchEnabled: false });
  });

  it('returns field-level issues on invalid save', async () => {
    const deps = setup([]);
    const response = await handleRequest(deps, {
      type: 'saveGroups',
      groups: [template('A', ['nope'])],
    });
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.issues?.[0]?.path).toMatch(/^groups\..+\.tabs\..+$/);
  });

  it('exposes an unreadable configuration without overwriting it', async () => {
    const deps = setup([]);
    deps.local.data.set('config', { schemaVersion: 1 });
    const state = await handleRequest(deps, { type: 'getState' });
    expect(state).toMatchObject({
      ok: true,
      data: { config: null, rawConfig: '{\n  "schemaVersion": 1\n}' },
    });
    const toggle = await handleRequest(deps, { type: 'setAutoLaunch', enabled: true });
    expect(toggle.ok).toBe(false);
    expect(deps.local.data.get('config')).toEqual({ schemaVersion: 1 });
  });
});
