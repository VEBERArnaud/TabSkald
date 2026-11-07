import { emptyConfig, type Config, type OperationResult } from '../shared/model';
import {
  hasErrors,
  normalizeConfig,
  parseConfig,
  validateConfig,
  type ConfigIssue,
} from '../shared/validation';
import { fromSyncItems, isGroupKey, toSyncItems } from '../shared/syncLayout';
import type { KeyValueStore } from './chromeApi';

/** Configuration written before it moved to chrome.storage.sync, in chrome.storage.local. */
const LEGACY_CONFIG_KEY = 'config';

/** Temporary run state, in chrome.storage.session (cleared on browser restart and extension reload). */
const STARTUP_KEY = 'startup';
const MANAGED_KEY = 'managedGroups';
const LAST_RESULT_KEY = 'lastResult';

/** The configuration lives in chrome.storage.sync; local only holds a configuration not migrated yet. */
export interface ConfigStores {
  sync: KeyValueStore;
  local: KeyValueStore;
}

export type ConfigLoad =
  { ok: true; config: Config; issues: ConfigIssue[] } | { ok: false; error: string; raw: unknown };

/** Never rewrites invalid stored data: the caller gets the raw value and an explanation. */
export async function loadConfig({ sync, local }: ConfigStores): Promise<ConfigLoad> {
  const raw = fromSyncItems(await sync.getAll()) ?? (await local.get(LEGACY_CONFIG_KEY));
  if (raw === undefined) return { ok: true, config: emptyConfig(), issues: [] };
  const parsed = parseConfig(raw);
  if (!parsed.ok) return { ok: false, error: parsed.error, raw };
  return { ok: true, config: parsed.value, issues: validateConfig(parsed.value) };
}

export type ConfigSave =
  { ok: true; config: Config } | { ok: false; error: string; issues: ConfigIssue[] };

function syncErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('MAX_WRITE_OPERATIONS')) {
    return 'Chrome limite le nombre d’enregistrements synchronisés : réessayez dans une minute.';
  }
  if (message.includes('QUOTA_BYTES')) {
    return 'Espace de synchronisation insuffisant : supprimez des groupes ou des onglets.';
  }
  return message;
}

export async function saveConfig(
  { sync, local }: ConfigStores,
  config: Config,
): Promise<ConfigSave> {
  const normalized = normalizeConfig(config);
  const issues = validateConfig(normalized);
  if (hasErrors(issues))
    return { ok: false, error: 'La configuration contient des erreurs.', issues };
  const items = toSyncItems(normalized);
  const removed = Object.keys(await sync.getAll()).filter(
    (key) => isGroupKey(key) && !(key in items),
  );
  try {
    // Settings and groups in one write, so that other computers never get settings
    // listing groups from a different save.
    await sync.setMany(items);
    if (removed.length > 0) await sync.remove(removed);
  } catch (error) {
    return { ok: false, error: syncErrorMessage(error), issues: [] };
  }
  await local.remove([LEGACY_CONFIG_KEY]);
  return { ok: true, config: normalized };
}

/** Moves a valid configuration from storage.local to storage.sync, unless sync already has one. */
export async function migrateLegacyConfig(stores: ConfigStores): Promise<void> {
  if (fromSyncItems(await stores.sync.getAll()) !== undefined) return;
  const parsed = parseConfig(await stores.local.get(LEGACY_CONFIG_KEY));
  // An unreadable configuration stays where it is, shown as is in the settings page.
  if (parsed.ok) await saveConfig(stores, parsed.value);
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
