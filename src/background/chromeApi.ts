import type { GroupColor } from '../shared/model';

/**
 * The small subset of Chrome APIs TabSkald relies on.
 * Business logic only talks to this interface so it can be tested without a browser.
 */

export interface WindowInfo {
  id: number;
  focused: boolean;
  incognito: boolean;
  type: string;
}

export interface TabInfo {
  id: number;
  windowId: number;
  index: number;
  /** -1 when the tab is not grouped. */
  groupId: number;
  url: string;
  pendingUrl: string;
}

export interface GroupInfo {
  id: number;
  windowId: number;
  title: string;
  color: string;
  collapsed: boolean;
}

export interface GroupProperties {
  title: string;
  color: GroupColor;
  collapsed: boolean;
}

export interface ChromeApi {
  getWindow(windowId: number): Promise<WindowInfo | undefined>;
  getNormalWindows(): Promise<WindowInfo[]>;
  queryTabs(filter: { windowId?: number; groupId?: number }): Promise<TabInfo[]>;
  createTab(windowId: number, url: string): Promise<TabInfo>;
  removeTabs(tabIds: number[]): Promise<void>;
  groupTabs(windowId: number, tabIds: number[]): Promise<number>;
  getGroup(groupId: number): Promise<GroupInfo | undefined>;
  queryGroups(filter: { windowId?: number }): Promise<GroupInfo[]>;
  updateGroup(groupId: number, properties: GroupProperties): Promise<void>;
}

export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  getAll(): Promise<Record<string, unknown>>;
  set(key: string, value: unknown): Promise<void>;
  /** Writes all items in a single call, which counts as one write against sync quotas. */
  setMany(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

export const NO_GROUP = -1;

function toWindowInfo(window: chrome.windows.Window): WindowInfo | undefined {
  if (window.id === undefined) return undefined;
  return {
    id: window.id,
    focused: window.focused,
    incognito: window.incognito,
    type: window.type ?? 'normal',
  };
}

function toTabInfo(tab: chrome.tabs.Tab): TabInfo {
  if (tab.id === undefined) throw new Error('Onglet sans identifiant.');
  return {
    id: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    groupId: tab.groupId,
    url: tab.url ?? '',
    pendingUrl: tab.pendingUrl ?? '',
  };
}

function toGroupInfo(group: chrome.tabGroups.TabGroup): GroupInfo {
  return {
    id: group.id,
    windowId: group.windowId,
    title: group.title ?? '',
    color: group.color,
    collapsed: group.collapsed,
  };
}

export function createChromeApi(): ChromeApi {
  return {
    async getWindow(windowId) {
      try {
        return toWindowInfo(await chrome.windows.get(windowId));
      } catch {
        return undefined;
      }
    },
    async getNormalWindows() {
      const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
      return windows.flatMap((window) => toWindowInfo(window) ?? []);
    },
    async queryTabs(filter) {
      const tabs = await chrome.tabs.query(filter);
      return tabs.filter((tab) => tab.id !== undefined).map(toTabInfo);
    },
    async createTab(windowId, url) {
      // Inactive so that opening a group never steals the user's focus.
      return toTabInfo(await chrome.tabs.create({ windowId, url, active: false }));
    },
    async removeTabs(tabIds) {
      await chrome.tabs.remove(tabIds);
    },
    async groupTabs(windowId, tabIds) {
      const [first, ...rest] = tabIds;
      if (first === undefined) throw new Error('Aucun onglet à regrouper.');
      return chrome.tabs.group({ tabIds: [first, ...rest], createProperties: { windowId } });
    },
    async getGroup(groupId) {
      try {
        return toGroupInfo(await chrome.tabGroups.get(groupId));
      } catch {
        return undefined;
      }
    },
    async queryGroups(filter) {
      const groups = await chrome.tabGroups.query(filter);
      return groups.map(toGroupInfo);
    },
    async updateGroup(groupId, properties) {
      await chrome.tabGroups.update(groupId, properties);
    },
  };
}

export function createChromeStore(area: chrome.storage.StorageArea): KeyValueStore {
  return {
    async get(key) {
      const items = await area.get(key);
      return items[key];
    },
    getAll() {
      return area.get(null);
    },
    async set(key, value) {
      await area.set({ [key]: value });
    },
    async setMany(items) {
      await area.set(items);
    },
    async remove(keys) {
      await area.remove(keys);
    },
  };
}
