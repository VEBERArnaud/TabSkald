import type { Config, GroupTemplate, OperationResult } from './model';
import { parseGroups, type ConfigIssue } from './validation';

export interface OpenGroupSummary {
  groupId: number;
  windowId: number;
  title: string;
  color: string;
  collapsed: boolean;
  urls: string[];
}

export interface AppState {
  /** Null when the stored configuration cannot be read. */
  config: Config | null;
  configError: string | null;
  /** Raw stored value, shown to the user when it cannot be read. */
  rawConfig: string | null;
  issues: ConfigIssue[];
  lastResult: OperationResult | null;
}

export type Request =
  | { type: 'getState' }
  | { type: 'saveGroups'; groups: GroupTemplate[] }
  | { type: 'setAutoLaunch'; enabled: boolean }
  | { type: 'resetConfig' }
  | { type: 'openGroup'; windowId: number; templateId: string }
  | { type: 'openStartupGroups'; windowId: number }
  | { type: 'listOpenGroups' };

export interface ResponseData {
  getState: AppState;
  saveGroups: Config;
  setAutoLaunch: Config;
  resetConfig: Config;
  openGroup: OperationResult;
  openStartupGroups: OperationResult;
  listOpenGroups: OpenGroupSummary[];
}

export type Response<T> =
  { ok: true; data: T } | { ok: false; error: string; issues?: ConfigIssue[] };

function isWindowId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** Runtime validation of messages received by the service worker. */
export function parseRequest(raw: unknown): Request | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const message = raw as Record<string, unknown>;
  switch (message.type) {
    case 'getState':
    case 'resetConfig':
    case 'listOpenGroups':
      return { type: message.type };
    case 'saveGroups': {
      const groups = parseGroups(message.groups);
      return groups.ok ? { type: 'saveGroups', groups: groups.value } : undefined;
    }
    case 'setAutoLaunch':
      return typeof message.enabled === 'boolean'
        ? { type: 'setAutoLaunch', enabled: message.enabled }
        : undefined;
    case 'openGroup':
      return isWindowId(message.windowId) && typeof message.templateId === 'string'
        ? { type: 'openGroup', windowId: message.windowId, templateId: message.templateId }
        : undefined;
    case 'openStartupGroups':
      return isWindowId(message.windowId)
        ? { type: 'openStartupGroups', windowId: message.windowId }
        : undefined;
    default:
      return undefined;
  }
}
