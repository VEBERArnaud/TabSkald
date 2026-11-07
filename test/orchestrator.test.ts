import { describe, expect, it } from 'vitest';
import { pickStartupWindow } from '../src/background/orchestrator';
import { readManaged, readStartup } from '../src/background/storage';
import { setup, template } from './helpers';

const NEW_TAB = 'chrome://newtab/';

describe('manual opening', () => {
  it('creates the group with its tabs in order, name, color and collapsed state', async () => {
    const tpl = template(
      'Projet 1',
      ['https://a.test/1', 'https://a.test/2', 'http://localhost:3000/x?y=1#z'],
      {
        color: 'green',
        collapsed: true,
      },
    );
    const { browser, orchestrator } = setup([tpl]);
    const windowId = browser.addWindow({ focused: true });
    browser.addTab(windowId, NEW_TAB);

    const result = await orchestrator.openManually(windowId, {
      kind: 'template',
      templateId: tpl.id,
    });

    expect(result.status).toBe('success');
    expect(result.groups).toEqual([{ templateId: tpl.id, name: 'Projet 1', status: 'created' }]);
    const [group] = browser.groupsOf(windowId);
    expect(group).toMatchObject({ title: 'Projet 1', color: 'green', collapsed: true });
    expect(browser.urlsOfGroup(group?.id ?? -1)).toEqual(tpl.tabs.map((tab) => tab.url));
  });

  it('appends after existing tabs and leaves them untouched, including the New Tab page', async () => {
    const tpl = template('Projet', ['https://a.test/']);
    const { browser, orchestrator } = setup([tpl]);
    const windowId = browser.addWindow({ focused: true });
    const newTab = browser.addTab(windowId, NEW_TAB);
    const github = browser.addTab(windowId, 'https://github.com/');
    const personalGroup = browser.addGroup(
      windowId,
      { title: 'Perso', color: 'red', collapsed: false },
      ['https://perso.test/'],
    );
    const before = structuredClone(browser.tabs);

    await orchestrator.openManually(windowId, { kind: 'template', templateId: tpl.id });

    expect(browser.tabs.slice(0, before.length)).toEqual(before);
    expect(
      browser
        .tabsOf(windowId)
        .map((tab) => tab.id)
        .slice(0, 2),
    ).toEqual([newTab, github]);
    expect(browser.groups.get(personalGroup)).toMatchObject({ title: 'Perso', color: 'red' });
    expect(browser.calls.removeTabs).toBeUndefined();
  });

  it('opens a template even when its startup opening is disabled', async () => {
    const tpl = template('Veille', ['https://veille.test/'], { openOnStartup: false });
    const { browser, orchestrator } = setup([tpl]);
    const windowId = browser.addWindow();

    const result = await orchestrator.openManually(windowId, {
      kind: 'template',
      templateId: tpl.id,
    });

    expect(result.status).toBe('success');
    expect(browser.groupsOf(windowId)).toHaveLength(1);
  });

  it('opens all startup groups in the configured order, in the requested window only', async () => {
    const p1 = template('Projet 1', ['https://p1.test/']);
    const veille = template('Veille', ['https://veille.test/'], { openOnStartup: false });
    const p2 = template('Projet 2', ['https://p2.test/a', 'https://p2.test/b'], { color: 'green' });
    const { browser, orchestrator } = setup([p1, veille, p2]);
    const other = browser.addWindow({ focused: true });
    const windowId = browser.addWindow();

    const result = await orchestrator.openManually(windowId, { kind: 'startupGroups' });

    expect(result.groups.map((group) => group.name)).toEqual(['Projet 1', 'Projet 2']);
    expect(browser.groupsOf(windowId).map((group) => group.title)).toEqual([
      'Projet 1',
      'Projet 2',
    ]);
    expect(browser.tabsOf(windowId).map((tab) => tab.pendingUrl)).toEqual([
      'https://p1.test/',
      'https://p2.test/a',
      'https://p2.test/b',
    ]);
    expect(browser.groupsOf(other)).toEqual([]);
  });

  it('does not duplicate a group on two close requests', async () => {
    const tpl = template('Projet', ['https://a.test/', 'https://b.test/']);
    const { browser, orchestrator } = setup([tpl]);
    const windowId = browser.addWindow();

    const [first, second] = await Promise.all([
      orchestrator.openManually(windowId, { kind: 'template', templateId: tpl.id }),
      orchestrator.openManually(windowId, { kind: 'template', templateId: tpl.id }),
    ]);

    expect(first.groups[0]?.status).toBe('created');
    expect(second.groups[0]?.status).toBe('alreadyOpen');
    expect(browser.groupsOf(windowId)).toHaveLength(1);
    expect(browser.tabsOf(windowId)).toHaveLength(2);
  });

  it('reopens a group the user closed, without enforcing it otherwise', async () => {
    const tpl = template('Projet', ['https://a.test/', 'https://b.test/']);
    const { browser, orchestrator } = setup([tpl]);
    const windowId = browser.addWindow();
    await orchestrator.openManually(windowId, { kind: 'template', templateId: tpl.id });
    const [group] = browser.groupsOf(windowId);

    // Closing a single tab does not trigger anything.
    const [firstTab] = browser.tabsOf(windowId);
    await browser.removeTabs([firstTab?.id ?? -1]);
    expect(browser.tabsOf(windowId)).toHaveLength(1);

    browser.closeGroup(group?.id ?? -1);
    const result = await orchestrator.openManually(windowId, {
      kind: 'template',
      templateId: tpl.id,
    });

    expect(result.groups[0]?.status).toBe('created');
    expect(browser.groupsOf(windowId)).toHaveLength(1);
    expect(browser.tabsOf(windowId)).toHaveLength(2);
  });

  it('opens the same group again in another window', async () => {
    const tpl = template('Projet', ['https://a.test/']);
    const { browser, orchestrator } = setup([tpl]);
    const first = browser.addWindow();
    const second = browser.addWindow();

    await orchestrator.openManually(first, { kind: 'template', templateId: tpl.id });
    const result = await orchestrator.openManually(second, {
      kind: 'template',
      templateId: tpl.id,
    });

    expect(result.groups[0]?.status).toBe('created');
    expect(browser.groupsOf(first)).toHaveLength(1);
    expect(browser.groupsOf(second)).toHaveLength(1);
  });

  it('allows the same URL in two distinct templates', async () => {
    const a = template('A', ['https://github.com/', 'https://a.test/']);
    const b = template('B', ['https://github.com/'], { color: 'red' });
    const { browser, orchestrator } = setup([a, b]);
    const windowId = browser.addWindow();
    browser.addTab(windowId, 'https://github.com/');

    const result = await orchestrator.openManually(windowId, { kind: 'startupGroups' });

    expect(result.status).toBe('success');
    expect(browser.groupsOf(windowId).map((group) => browser.urlsOfGroup(group.id))).toEqual([
      ['https://github.com/', 'https://a.test/'],
      ['https://github.com/'],
    ]);
  });

  it('refuses incognito, unknown windows and unknown templates', async () => {
    const tpl = template('Projet', ['https://a.test/']);
    const { browser, orchestrator } = setup([tpl]);
    const incognito = browser.addWindow({ incognito: true });
    const normal = browser.addWindow();

    expect(
      (await orchestrator.openManually(incognito, { kind: 'template', templateId: tpl.id })).status,
    ).toBe('error');
    expect(
      (await orchestrator.openManually(999, { kind: 'template', templateId: tpl.id })).status,
    ).toBe('error');
    expect(
      (await orchestrator.openManually(normal, { kind: 'template', templateId: 'nope' })).status,
    ).toBe('error');
    expect(browser.groups.size).toBe(0);
  });
});

describe('startup', () => {
  it('opens only enabled templates, in order, in the focused normal window', async () => {
    const p1 = template('Projet 1', ['https://p1.test/'], { collapsed: true });
    const veille = template('Veille', ['https://veille.test/'], { openOnStartup: false });
    const p2 = template('Projet 2', ['https://p2.test/'], { color: 'green' });
    const { browser, orchestrator, session } = setup([p1, veille, p2]);
    browser.addWindow({ incognito: true, focused: true });
    const background = browser.addWindow();
    const focused = browser.addWindow({ focused: true });
    browser.addTab(focused, 'https://github.com/');
    browser.addTab(focused, 'https://feedly.com/');

    const result = await orchestrator.handleBrowserStartup();

    expect(result?.status).toBe('success');
    expect(browser.groupsOf(focused).map((g) => [g.title, g.color, g.collapsed])).toEqual([
      ['Projet 1', 'blue', true],
      ['Projet 2', 'green', false],
    ]);
    expect(browser.groupsOf(background)).toEqual([]);
    expect(
      browser
        .tabsOf(focused)
        .slice(0, 2)
        .map((tab) => tab.url),
    ).toEqual(['https://github.com/', 'https://feedly.com/']);
    expect((await readStartup(session))?.status).toBe('done');
  });

  it('does nothing when automatic opening is disabled', async () => {
    const { browser, orchestrator } = setup([template('Projet', ['https://a.test/'])], {
      autoLaunchEnabled: false,
    });
    browser.addWindow({ focused: true });

    const result = await orchestrator.handleBrowserStartup();

    expect(result?.status).toBe('skipped');
    expect(browser.groups.size).toBe(0);
    expect(browser.calls.createTab).toBeUndefined();
  });

  it('does not open anything when the service worker wakes up after startup', async () => {
    const { browser, orchestrator, restartWorker } = setup([
      template('Projet', ['https://a.test/']),
    ]);
    const windowId = browser.addWindow({ focused: true });
    await orchestrator.handleBrowserStartup();
    expect(browser.groupsOf(windowId)).toHaveLength(1);

    const woken = restartWorker();
    expect(await woken.resumeStartup()).toBeUndefined();
    await woken.handleWindowCreated({
      id: browser.addWindow(),
      focused: false,
      incognito: false,
      type: 'normal',
    });

    expect(browser.groups.size).toBe(1);
  });

  it('does not open anything on extension install, update or reload (empty session state)', async () => {
    const { browser, orchestrator } = setup([template('Projet', ['https://a.test/'])]);
    browser.addWindow({ focused: true });

    expect(await orchestrator.resumeStartup()).toBeUndefined();
    expect(browser.calls.createTab).toBeUndefined();
  });

  it('waits for a normal window when none exists, then opens only once', async () => {
    const { browser, orchestrator, session } = setup([template('Projet', ['https://a.test/'])]);

    expect(await orchestrator.handleBrowserStartup()).toBeUndefined();
    expect((await readStartup(session))?.status).toBe('waitingForWindow');

    const incognito = browser.addWindow({ incognito: true });
    await orchestrator.handleWindowCreated({
      id: incognito,
      focused: true,
      incognito: true,
      type: 'normal',
    });
    expect(browser.groups.size).toBe(0);

    const first = browser.addWindow({ focused: true });
    const result = await orchestrator.handleWindowCreated({
      id: first,
      focused: true,
      incognito: false,
      type: 'normal',
    });
    expect(result?.status).toBe('success');
    expect(browser.groupsOf(first)).toHaveLength(1);

    const second = browser.addWindow({ focused: true });
    expect(
      await orchestrator.handleWindowCreated({
        id: second,
        focused: true,
        incognito: false,
        type: 'normal',
      }),
    ).toBeUndefined();
    expect(browser.groupsOf(second)).toEqual([]);
  });

  it('resumes an interrupted startup without recreating what already exists', async () => {
    const a = template('A', ['https://a.test/']);
    const b = template('B', ['https://b.test/']);
    const { browser, orchestrator, session, restartWorker } = setup([a, b]);
    const windowId = browser.addWindow({ focused: true });
    // Simulates a worker stopped after opening A, while the startup was running.
    await orchestrator.openManually(windowId, { kind: 'template', templateId: a.id });
    await session.set('startup', { status: 'running', updatedAt: 0 });

    const result = await restartWorker().resumeStartup();

    expect(result?.groups.map((g) => [g.name, g.status])).toEqual([
      ['A', 'alreadyOpen'],
      ['B', 'created'],
    ]);
    expect(browser.groupsOf(windowId).map((g) => g.title)).toEqual(['A', 'B']);
  });

  it('rereads Chrome when the tracked group disappeared before resuming', async () => {
    const a = template('A', ['https://a.test/']);
    const { browser, orchestrator, session, restartWorker } = setup([a]);
    const windowId = browser.addWindow({ focused: true });
    await orchestrator.openManually(windowId, { kind: 'template', templateId: a.id });
    const [group] = browser.groupsOf(windowId);
    browser.closeGroup(group?.id ?? -1);
    await session.set('startup', { status: 'pending', updatedAt: 0 });

    const result = await restartWorker().resumeStartup();

    expect(result?.groups[0]?.status).toBe('created');
    expect(await readManaged(session)).toHaveLength(1);
  });

  it('does not open anything when the stored configuration is invalid, and keeps it', async () => {
    const { browser, orchestrator, local } = setup([]);
    const broken = { schemaVersion: 1, autoLaunchEnabled: true, groups: [{ id: 'x', name: 'X' }] };
    local.data.set('config', broken);
    browser.addWindow({ focused: true });

    const result = await orchestrator.handleBrowserStartup();

    expect(result?.status).toBe('error');
    expect(result?.message).toContain('Configuration invalide');
    expect(local.data.get('config')).toEqual(broken);
    expect(browser.groups.size).toBe(0);
  });
});

describe('recognition of groups already open', () => {
  it('reuses a unique, fully matching group restored by Chrome', async () => {
    const tpl = template('Projet', ['https://a.test', 'https://b.test/page'], { color: 'cyan' });
    const { browser, orchestrator, session } = setup([tpl]);
    const restoredWindow = browser.addWindow();
    const focused = browser.addWindow({ focused: true });
    // Normalized comparison: "https://a.test" and "https://a.test/" are the same URL.
    const restored = browser.addGroup(
      restoredWindow,
      { title: 'Projet', color: 'cyan', collapsed: true },
      ['https://a.test/', 'https://b.test/page'],
    );

    const result = await orchestrator.handleBrowserStartup();

    expect(result?.groups[0]?.status).toBe('recognized');
    expect(browser.groups.size).toBe(1);
    expect(browser.calls.createTab).toBeUndefined();
    expect(await readManaged(session)).toEqual([
      { templateId: tpl.id, windowId: restoredWindow, groupId: restored, styled: true },
    ]);
    expect(browser.groupsOf(focused)).toEqual([]);
  });

  it('reports a conflict and preserves a group with the same name but different content', async () => {
    const tpl = template('Projet', ['https://a.test/', 'https://b.test/']);
    const other = template('Autre', ['https://c.test/']);
    const { browser, orchestrator } = setup([tpl, other]);
    const windowId = browser.addWindow({ focused: true });
    const restored = browser.addGroup(
      windowId,
      { title: 'Projet', color: 'blue', collapsed: false },
      ['https://a.test/', 'https://modified.test/'],
    );
    const before = structuredClone(browser.tabs);

    const result = await orchestrator.handleBrowserStartup();

    expect(result?.status).toBe('partial');
    expect(result?.groups.map((g) => [g.name, g.status])).toEqual([
      ['Projet', 'conflict'],
      ['Autre', 'created'],
    ]);
    expect(browser.tabs.slice(0, before.length)).toEqual(before);
    expect(browser.groups.get(restored)).toMatchObject({ title: 'Projet', color: 'blue' });
    expect(browser.calls.updateGroup).toBe(1);
  });

  it('reports a conflict when several identical groups are open', async () => {
    const tpl = template('Projet', ['https://a.test/']);
    const { browser, orchestrator } = setup([tpl]);
    const windowId = browser.addWindow({ focused: true });
    const properties = { title: 'Projet', color: 'blue', collapsed: false };
    browser.addGroup(windowId, properties, ['https://a.test/']);
    browser.addGroup(windowId, properties, ['https://a.test/']);

    const manual = await orchestrator.openManually(windowId, {
      kind: 'template',
      templateId: tpl.id,
    });

    expect(manual.groups[0]?.status).toBe('conflict');
    expect(browser.groups.size).toBe(2);
  });

  it('does not rely on the name alone: a manual request creates the group next to a similar one', async () => {
    const tpl = template('Projet', ['https://a.test/']);
    const { browser, orchestrator } = setup([tpl]);
    const windowId = browser.addWindow();
    const similar = browser.addGroup(
      windowId,
      { title: 'Projet', color: 'red', collapsed: false },
      ['https://a.test/'],
    );

    const result = await orchestrator.openManually(windowId, {
      kind: 'template',
      templateId: tpl.id,
    });

    expect(result.groups[0]?.status).toBe('created');
    expect(result.groups[0]?.detail).toContain('Un autre groupe');
    expect(browser.groups.get(similar)).toMatchObject({ color: 'red' });
    expect(browser.groups.size).toBe(2);
  });

  it('recognizes tabs still navigating through their pendingUrl', async () => {
    const tpl = template('Projet', ['https://a.test/']);
    const { browser, orchestrator, restartWorker, session } = setup([tpl]);
    const windowId = browser.addWindow({ focused: true });
    await orchestrator.openManually(windowId, { kind: 'template', templateId: tpl.id });
    // Session state lost (e.g. extension reloaded) while the tab is still loading.
    await session.set('managedGroups', []);

    const result = await restartWorker().openManually(windowId, {
      kind: 'template',
      templateId: tpl.id,
    });

    expect(result.groups[0]?.status).toBe('recognized');
    expect(browser.groups.size).toBe(1);
  });
});

describe('partial failures', () => {
  it('keeps going when one tab cannot be created', async () => {
    const tpl = template('Projet', ['https://a.test/', 'https://fail.test/', 'https://c.test/']);
    const next = template('Suivant', ['https://d.test/']);
    const { browser, orchestrator } = setup([tpl, next]);
    const windowId = browser.addWindow();
    browser.failures.createTab = (_window: number, url: string) =>
      url.includes('fail') ? new Error('boom') : undefined;

    const result = await orchestrator.openManually(windowId, { kind: 'startupGroups' });

    expect(result.status).toBe('partial');
    expect(result.groups.map((g) => g.status)).toEqual(['partial', 'created']);
    expect(result.groups[0]?.detail).toContain('1 onglet');
    const [group] = browser.groupsOf(windowId);
    expect(browser.urlsOfGroup(group?.id ?? -1)).toEqual(['https://a.test/', 'https://c.test/']);
  });

  it('closes only its own new tabs when grouping fails, and continues with the next group', async () => {
    const a = template('A', ['https://a.test/']);
    const b = template('B', ['https://b.test/']);
    const { browser, orchestrator } = setup([a, b]);
    const windowId = browser.addWindow();
    const existing = browser.addTab(windowId, 'https://github.com/');
    let calls = 0;
    browser.failures.groupTabs = () => (calls++ === 0 ? new Error('group failed') : undefined);

    const result = await orchestrator.openManually(windowId, { kind: 'startupGroups' });

    expect(result.groups.map((g) => g.status)).toEqual(['failed', 'created']);
    expect(browser.tabsOf(windowId).map((tab) => tab.id)[0]).toBe(existing);
    expect(browser.tabsOf(windowId)).toHaveLength(2);
    expect(browser.groupsOf(windowId).map((g) => g.title)).toEqual(['B']);
  });

  it('reports a styling failure, then fixes it on retry without recreating the group', async () => {
    const tpl = template('Projet', ['https://a.test/'], { color: 'purple', collapsed: true });
    const { browser, orchestrator } = setup([tpl]);
    const windowId = browser.addWindow();
    browser.failures.updateGroup = () => new Error('update failed');

    const first = await orchestrator.openManually(windowId, {
      kind: 'template',
      templateId: tpl.id,
    });
    expect(first.status).toBe('partial');
    expect(browser.groupsOf(windowId)[0]).toMatchObject({ title: '', color: 'grey' });

    browser.failures.updateGroup = undefined;
    const retry = await orchestrator.openManually(windowId, {
      kind: 'template',
      templateId: tpl.id,
    });

    expect(retry.groups[0]?.status).toBe('alreadyOpen');
    expect(browser.groups.size).toBe(1);
    expect(browser.groupsOf(windowId)[0]).toMatchObject({
      title: 'Projet',
      color: 'purple',
      collapsed: true,
    });
  });

  it('reports an error when every group fails', async () => {
    const { browser, orchestrator } = setup([template('A', ['https://a.test/'])]);
    const windowId = browser.addWindow();
    browser.failures.createTab = () => new Error('boom');

    const result = await orchestrator.openManually(windowId, { kind: 'startupGroups' });

    expect(result.status).toBe('error');
    expect(result.groups[0]?.detail).toBe('Aucun onglet n’a pu être créé.');
  });

  it('stops cleanly when the target window is closed during the operation', async () => {
    const a = template('A', ['https://a.test/', 'https://a.test/2']);
    const b = template('B', ['https://b.test/']);
    const { browser, orchestrator } = setup([a, b]);
    const windowId = browser.addWindow();
    browser.failures.createTab = () => {
      browser.closeWindow(windowId);
      return new Error('No window');
    };

    const result = await orchestrator.openManually(windowId, { kind: 'startupGroups' });

    expect(result.status).toBe('error');
    expect(result.groups.map((g) => g.detail)).toEqual([
      'La fenêtre cible a été fermée pendant l’ouverture.',
      'La fenêtre cible a été fermée.',
    ]);
  });

  it('isolates an unexpected API rejection to its group', async () => {
    const a = template('A', ['https://a.test/']);
    const b = template('B', ['https://b.test/']);
    const { browser, orchestrator } = setup([a, b]);
    const windowId = browser.addWindow();
    let calls = 0;
    browser.failures.queryGroups = () => (calls++ === 0 ? new Error('query failed') : undefined);

    const result = await orchestrator.openManually(windowId, { kind: 'startupGroups' });

    expect(result.groups.map((g) => g.status)).toEqual(['failed', 'created']);
  });
});

describe('pickStartupWindow', () => {
  const window = (id: number, extra: object = {}) => ({
    id,
    focused: false,
    incognito: false,
    type: 'normal',
    ...extra,
  });

  it('prefers the focused normal window', () => {
    expect(pickStartupWindow([window(1), window(2, { focused: true })])?.id).toBe(2);
  });

  it('falls back to the lowest id, ignoring incognito and non-normal windows', () => {
    expect(
      pickStartupWindow([
        window(5),
        window(1, { incognito: true, focused: true }),
        window(3),
        window(2, { type: 'popup' }),
      ])?.id,
    ).toBe(3);
  });

  it('returns undefined without a usable window', () => {
    expect(pickStartupWindow([window(1, { incognito: true })])).toBeUndefined();
  });
});
