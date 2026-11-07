import type {
  ChromeApi,
  GroupInfo,
  GroupProperties,
  KeyValueStore,
  TabInfo,
  WindowInfo,
} from '../src/background/chromeApi';
import { NO_GROUP } from '../src/background/chromeApi';

export class MemoryStore implements KeyValueStore {
  readonly data = new Map<string, unknown>();
  /** When set, every write is rejected with this error, like an exceeded sync quota. */
  writeError: Error | undefined;

  get(key: string): Promise<unknown> {
    const value = this.data.get(key);
    return Promise.resolve(value === undefined ? undefined : structuredClone(value));
  }

  getAll(): Promise<Record<string, unknown>> {
    return Promise.resolve(structuredClone(Object.fromEntries(this.data)));
  }

  set(key: string, value: unknown): Promise<void> {
    return this.setMany({ [key]: value });
  }

  setMany(items: Record<string, unknown>): Promise<void> {
    if (this.writeError) return Promise.reject(this.writeError);
    for (const [key, value] of Object.entries(items)) this.data.set(key, structuredClone(value));
    return Promise.resolve();
  }

  remove(keys: string[]): Promise<void> {
    if (this.writeError) return Promise.reject(this.writeError);
    for (const key of keys) this.data.delete(key);
    return Promise.resolve();
  }
}

interface FakeTab {
  id: number;
  windowId: number;
  groupId: number;
  url: string;
  pendingUrl: string;
}

type Failure = (...args: never[]) => Error | undefined;

/**
 * In-memory browser implementing the ChromeApi adapter.
 * Each method can be made to fail through `failures`, to simulate rejected Chrome calls.
 */
export class FakeBrowser implements ChromeApi {
  windows = new Map<number, WindowInfo>();
  /** Global tab order; a tab's index is its position among the tabs of its window. */
  tabs: FakeTab[] = [];
  groups = new Map<number, GroupInfo>();
  failures: Partial<Record<keyof ChromeApi, Failure>> = {};
  calls: Partial<Record<keyof ChromeApi, number>> = {};
  private nextId = 100;

  private hit(method: keyof ChromeApi, ...args: unknown[]): void {
    this.calls[method] = (this.calls[method] ?? 0) + 1;
    const failure = this.failures[method] as ((...a: unknown[]) => Error | undefined) | undefined;
    const error = failure?.(...args);
    if (error) throw error;
  }

  // --- Test helpers -------------------------------------------------------

  addWindow(options: Partial<WindowInfo> = {}): number {
    const id = options.id ?? this.nextId++;
    this.windows.set(id, { id, focused: false, incognito: false, type: 'normal', ...options });
    return id;
  }

  addTab(windowId: number, url: string, groupId = NO_GROUP): number {
    const id = this.nextId++;
    this.tabs.push({ id, windowId, groupId, url, pendingUrl: '' });
    return id;
  }

  /** Simulates a group already open, e.g. restored by Chrome. */
  addGroup(
    windowId: number,
    properties: Omit<GroupInfo, 'id' | 'windowId'>,
    urls: string[],
  ): number {
    const id = this.nextId++;
    this.groups.set(id, { id, windowId, ...properties });
    for (const url of urls) this.addTab(windowId, url, id);
    return id;
  }

  /** Simulates the user closing a whole group. */
  closeGroup(groupId: number): void {
    this.tabs = this.tabs.filter((tab) => tab.groupId !== groupId);
    this.groups.delete(groupId);
  }

  closeWindow(windowId: number): void {
    this.windows.delete(windowId);
    this.tabs = this.tabs.filter((tab) => tab.windowId !== windowId);
    for (const [id, group] of this.groups) if (group.windowId === windowId) this.groups.delete(id);
  }

  /** Simulates the end of navigation of every pending tab. */
  finishNavigation(): void {
    for (const tab of this.tabs) {
      if (tab.pendingUrl !== '') {
        tab.url = tab.pendingUrl;
        tab.pendingUrl = '';
      }
    }
  }

  tabsOf(windowId: number): FakeTab[] {
    return this.tabs.filter((tab) => tab.windowId === windowId);
  }

  urlsOfGroup(groupId: number): string[] {
    return this.tabs
      .filter((tab) => tab.groupId === groupId)
      .map((tab) => tab.pendingUrl || tab.url);
  }

  groupsOf(windowId: number): GroupInfo[] {
    return [...this.groups.values()].filter((group) => group.windowId === windowId);
  }

  private toTabInfo(tab: FakeTab): TabInfo {
    return { ...tab, index: this.tabsOf(tab.windowId).indexOf(tab) };
  }

  // --- ChromeApi ----------------------------------------------------------

  getWindow(windowId: number): Promise<WindowInfo | undefined> {
    this.hit('getWindow', windowId);
    const window = this.windows.get(windowId);
    return Promise.resolve(window ? { ...window } : undefined);
  }

  getNormalWindows(): Promise<WindowInfo[]> {
    this.hit('getNormalWindows');
    return Promise.resolve(
      [...this.windows.values()].filter((w) => w.type === 'normal').map((w) => ({ ...w })),
    );
  }

  queryTabs(filter: { windowId?: number; groupId?: number }): Promise<TabInfo[]> {
    this.hit('queryTabs', filter);
    return Promise.resolve(
      this.tabs
        .filter((tab) => filter.windowId === undefined || tab.windowId === filter.windowId)
        .filter((tab) => filter.groupId === undefined || tab.groupId === filter.groupId)
        .map((tab) => this.toTabInfo(tab)),
    );
  }

  createTab(windowId: number, url: string): Promise<TabInfo> {
    this.hit('createTab', windowId, url);
    if (!this.windows.has(windowId))
      return Promise.reject(new Error(`No window with id: ${windowId}.`));
    const id = this.nextId++;
    // A new tab starts navigating: its destination is only exposed in pendingUrl.
    const tab: FakeTab = { id, windowId, groupId: NO_GROUP, url: '', pendingUrl: url };
    this.tabs.push(tab);
    return Promise.resolve(this.toTabInfo(tab));
  }

  removeTabs(tabIds: number[]): Promise<void> {
    this.hit('removeTabs', tabIds);
    this.tabs = this.tabs.filter((tab) => !tabIds.includes(tab.id));
    for (const [id] of this.groups) {
      if (!this.tabs.some((tab) => tab.groupId === id)) this.groups.delete(id);
    }
    return Promise.resolve();
  }

  groupTabs(windowId: number, tabIds: number[]): Promise<number> {
    this.hit('groupTabs', windowId, tabIds);
    const tabs = this.tabs.filter((tab) => tabIds.includes(tab.id));
    if (tabs.length !== tabIds.length || tabs.some((tab) => tab.windowId !== windowId)) {
      return Promise.reject(new Error('Invalid tab ids.'));
    }
    const id = this.nextId++;
    this.groups.set(id, { id, windowId, title: '', color: 'grey', collapsed: false });
    for (const tab of tabs) tab.groupId = id;
    return Promise.resolve(id);
  }

  getGroup(groupId: number): Promise<GroupInfo | undefined> {
    this.hit('getGroup', groupId);
    const group = this.groups.get(groupId);
    return Promise.resolve(group ? { ...group } : undefined);
  }

  queryGroups(filter: { windowId?: number }): Promise<GroupInfo[]> {
    this.hit('queryGroups', filter);
    return Promise.resolve(
      [...this.groups.values()]
        .filter((group) => filter.windowId === undefined || group.windowId === filter.windowId)
        .map((group) => ({ ...group })),
    );
  }

  updateGroup(groupId: number, properties: GroupProperties): Promise<void> {
    this.hit('updateGroup', groupId, properties);
    const group = this.groups.get(groupId);
    if (!group) return Promise.reject(new Error(`No group with id: ${groupId}.`));
    Object.assign(group, properties);
    return Promise.resolve();
  }
}
