import type { GroupTemplate } from '../shared/model';
import type { GroupInfo, TabInfo } from './chromeApi';

/** Canonical form used for comparison only; stored URLs are never rewritten. */
export function normalizeUrl(url: string): string {
  try {
    return new URL(url.trim()).href;
  } catch {
    return url.trim();
  }
}

/** A tab still navigating exposes its destination in pendingUrl. */
export function effectiveUrl(tab: Pick<TabInfo, 'url' | 'pendingUrl'>): string {
  return tab.pendingUrl !== '' ? tab.pendingUrl : tab.url;
}

export interface OpenGroup {
  group: GroupInfo;
  /** Effective URLs of the group's tabs, in tab order. */
  urls: string[];
}

export function groupOpenTabs(groups: GroupInfo[], tabs: TabInfo[]): OpenGroup[] {
  return groups.map((group) => ({
    group,
    urls: tabs
      .filter((tab) => tab.groupId === group.id)
      .sort((a, b) => a.index - b.index)
      .map(effectiveUrl),
  }));
}

/**
 * Conservative recognition of groups already open, e.g. restored by Chrome:
 * - exact: same title, same color and same ordered list of normalized URLs;
 * - similar: same title but different content.
 * A matching name alone is never enough to treat a group as TabSkald's.
 */
export function classifyOpenGroups(
  template: GroupTemplate,
  openGroups: OpenGroup[],
): { exact: GroupInfo[]; similar: GroupInfo[] } {
  const title = template.name.trim();
  const urls = template.tabs.map((tab) => normalizeUrl(tab.url));
  const exact: GroupInfo[] = [];
  const similar: GroupInfo[] = [];
  for (const open of openGroups) {
    if (open.group.title.trim() !== title) continue;
    const sameContent =
      open.group.color === template.color &&
      open.urls.length === urls.length &&
      open.urls.every((url, index) => normalizeUrl(url) === urls[index]);
    (sameContent ? exact : similar).push(open.group);
  }
  return { exact, similar };
}
