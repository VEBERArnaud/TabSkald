import type { Config } from './model';

/** chrome.storage.sync quotas (QUOTA_BYTES and QUOTA_BYTES_PER_ITEM). */
export const SYNC_QUOTA_BYTES = 102_400;
export const SYNC_QUOTA_BYTES_PER_ITEM = 8_192;

export const SETTINGS_KEY = 'settings';
const GROUP_KEY_PREFIX = 'group:';

/** Everything but the groups, which are stored under their own keys. */
export interface SyncSettings {
  schemaVersion: number;
  autoLaunchEnabled: boolean;
  groupIds: string[];
}

export const groupKey = (groupId: string) => `${GROUP_KEY_PREFIX}${groupId}`;
export const isGroupKey = (key: string) => key.startsWith(GROUP_KEY_PREFIX);

/** One item per group keeps each item under the per-item quota. */
export function toSyncItems(config: Config): Record<string, unknown> {
  const settings: SyncSettings = {
    schemaVersion: config.schemaVersion,
    autoLaunchEnabled: config.autoLaunchEnabled,
    groupIds: config.groups.map((group) => group.id),
  };
  return {
    [SETTINGS_KEY]: settings,
    ...Object.fromEntries(config.groups.map((group) => [groupKey(group.id), group])),
  };
}

/**
 * Rebuilds the stored configuration, still unvalidated, or undefined when nothing is stored.
 * A group listed in the settings but not received yet (sync in progress) is left out.
 */
export function fromSyncItems(items: Record<string, unknown>): unknown {
  const settings = items[SETTINGS_KEY];
  if (settings === undefined) return undefined;
  if (typeof settings !== 'object' || settings === null) return settings;
  const { groupIds, ...rest } = settings as Record<string, unknown>;
  if (!Array.isArray(groupIds)) return settings;
  const groups = groupIds.flatMap((id: unknown) => {
    if (typeof id !== 'string') return [id];
    const group = items[groupKey(id)];
    return group === undefined ? [] : [group];
  });
  return { ...rest, groups };
}

/** Size of an item as Chrome counts it: the key plus the JSON of the value. */
export function itemBytes(key: string, value: unknown): number {
  return new TextEncoder().encode(key + JSON.stringify(value)).length;
}
