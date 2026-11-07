import { isGroupColor, newId, type GroupTemplate } from './model';
import { checkUrl } from './validation';

export interface UnsupportedUrl {
  url: string;
  reason: string;
}

export interface ImportDraft {
  template: GroupTemplate;
  unsupported: UnsupportedUrl[];
}

export const DEFAULT_IMPORTED_NAME = 'Groupe importé';

/**
 * One-off copy of an open Chrome group into a new template.
 * Unsupported URLs (chrome://, file://, …) are reported, never silently dropped.
 */
export function buildImportDraft(group: {
  title: string;
  color: string;
  collapsed: boolean;
  urls: string[];
}): ImportDraft {
  const unsupported: UnsupportedUrl[] = [];
  const tabs: GroupTemplate['tabs'] = [];
  for (const url of group.urls) {
    const check = checkUrl(url);
    if (check.ok) tabs.push({ id: newId(), url: check.url });
    else unsupported.push({ url, reason: check.message });
  }
  return {
    template: {
      id: newId(),
      name: group.title.trim() === '' ? DEFAULT_IMPORTED_NAME : group.title.trim(),
      color: isGroupColor(group.color) ? group.color : 'grey',
      collapsed: group.collapsed,
      // Opening at startup is opt-in for imported groups.
      openOnStartup: false,
      tabs,
    },
    unsupported,
  };
}
