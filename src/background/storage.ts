import { emptyConfig, type Config, type OperationResult } from '../shared/model';
import {
  hasErrors,
  normalizeConfig,
  parseConfig,
  validateConfig,
  type ConfigIssue,
} from '../shared/validation';
import type { KeyValueStore } from './chromeApi';

/** Persistent configuration, in chrome.storage.local. */
const CONFIG_KEY = 'config';

/** Temporary run state, in chrome.storage.session (cleared on browser restart and extension reload). */
const STARTUP_KEY = 'startup';
const MANAGED_KEY = 'managedGroups';
const LAST_RESULT_KEY = 'lastResult';

export type ConfigLoad =
  { ok: true; config: Config; issues: ConfigIssue[] } | { ok: false; error: string; raw: unknown };

/** Never rewrites invalid stored data: the caller gets the raw value and an explanation. */
export async function loadConfig(local: KeyValueStore): Promise<ConfigLoad> {
  const raw = await local.get(CONFIG_KEY);
  if (raw === undefined) return { ok: true, config: emptyConfig(), issues: [] };
  const parsed = parseConfig(raw);
  if (!parsed.ok) return { ok: false, error: parsed.error, raw };
  return { ok: true, config: parsed.value, issues: validateConfig(parsed.value) };
}

export type ConfigSave = { ok: true; config: Config } | { ok: false; issues: ConfigIssue[] };

export async function saveConfig(local: KeyValueStore, config: Config): Promise<ConfigSave> {
  const normalized = normalizeConfig(config);
  const issues = validateConfig(normalized);
  if (hasErrors(issues)) return { ok: false, issues };
  await local.set(CONFIG_KEY, normalized);
  return { ok: true, config: normalized };
}

/** Lifecycle of the automatic opening for the current browser session. */
export type StartupStatus = 'pending' | 'waitingForWindow' | 'running' | 'done';

export interface StartupState {
  status: StartupStatus;
  updatedAt: number;
}

const STARTUP_STATUSES: readonly string[] = ['pending', 'waitingForWindow', 'running', 'done'];

export async function readStartup(session: KeyValueStore): Promise<StartupState | undefined> {
  const raw = await session.get(STARTUP_KEY);
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { status, updatedAt } = raw as Record<string, unknown>;
  if (typeof status !== 'string' || !STARTUP_STATUSES.includes(status)) return undefined;
  return {
    status: status as StartupStatus,
    updatedAt: typeof updatedAt === 'number' ? updatedAt : 0,
  };
}

export async function writeStartup(session: KeyValueStore, status: StartupStatus): Promise<void> {
  await session.set(STARTUP_KEY, { status, updatedAt: Date.now() } satisfies StartupState);
}

/** A Chrome group created (or recognized) by TabSkald during this browser session. */
export interface ManagedGroup {
  templateId: string;
  windowId: number;
  groupId: number;
  /** False when grouping succeeded but applying name/color/collapsed did not. */
  styled: boolean;
}

function isManagedGroup(value: unknown): value is ManagedGroup {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.templateId === 'string' &&
    typeof entry.windowId === 'number' &&
    typeof entry.groupId === 'number' &&
    typeof entry.styled === 'boolean'
  );
}

export async function readManaged(session: KeyValueStore): Promise<ManagedGroup[]> {
  const raw = await session.get(MANAGED_KEY);
  return Array.isArray(raw) ? raw.filter(isManagedGroup) : [];
}

export async function writeManaged(session: KeyValueStore, entries: ManagedGroup[]): Promise<void> {
  await session.set(MANAGED_KEY, entries);
}

export async function readLastResult(session: KeyValueStore): Promise<OperationResult | undefined> {
  const raw = await session.get(LAST_RESULT_KEY);
  return typeof raw === 'object' && raw !== null ? (raw as OperationResult) : undefined;
}

export async function writeLastResult(
  session: KeyValueStore,
  result: OperationResult,
): Promise<void> {
  await session.set(LAST_RESULT_KEY, result);
}
