import {
  SCHEMA_VERSION,
  isGroupColor,
  type Config,
  type GroupTemplate,
  type TabTemplate,
} from './model';
import {
  SETTINGS_KEY,
  SYNC_QUOTA_BYTES,
  SYNC_QUOTA_BYTES_PER_ITEM,
  groupKey,
  itemBytes,
  toSyncItems,
} from './syncLayout';

export const MAX_NAME_LENGTH = 100;

export type UrlCheck = { ok: true; url: string } | { ok: false; message: string };

/**
 * Accepts absolute http(s) URLs, including localhost and ports.
 * Only the outer whitespace is removed: the URL itself is kept as typed.
 */
export function checkUrl(raw: string): UrlCheck {
  const url = raw.trim();
  if (url === '') return { ok: false, message: 'URL requise.' };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, message: 'URL invalide : indiquez une adresse complète (https://…).' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      ok: false,
      message: `Protocole « ${parsed.protocol} » non pris en charge : seules les URL http et https sont acceptées.`,
    };
  }
  return { ok: true, url };
}

export interface ConfigIssue {
  /** Points at a field: `groups` (the whole list), `groups.<groupId>.name`, `groups.<groupId>.tabs`, `groups.<groupId>.tabs.<tabId>`. */
  path: string;
  severity: 'error' | 'warning';
  message: string;
}

export const issuePath = {
  groups: () => 'groups',
  groupName: (groupId: string) => `groups.${groupId}.name`,
  groupTabs: (groupId: string) => `groups.${groupId}.tabs`,
  tab: (groupId: string, tabId: string) => `groups.${groupId}.tabs.${tabId}`,
};

/** Business rules, checked on save and before opening anything. */
export function validateConfig(config: Config): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  for (const group of config.groups) {
    const name = group.name.trim();
    if (name === '') {
      issues.push({
        path: issuePath.groupName(group.id),
        severity: 'error',
        message: 'Nom requis.',
      });
    } else if (name.length > MAX_NAME_LENGTH) {
      issues.push({
        path: issuePath.groupName(group.id),
        severity: 'error',
        message: `Nom trop long (${MAX_NAME_LENGTH} caractères maximum).`,
      });
    }
    if (group.openOnStartup && group.tabs.length === 0) {
      issues.push({
        path: issuePath.groupTabs(group.id),
        severity: 'error',
        message: 'Un groupe ouvert au démarrage doit contenir au moins une URL valide.',
      });
    }
    const seen = new Set<string>();
    for (const tab of group.tabs) {
      const check = checkUrl(tab.url);
      if (!check.ok) {
        issues.push({
          path: issuePath.tab(group.id, tab.id),
          severity: 'error',
          message: check.message,
        });
        continue;
      }
      if (seen.has(check.url)) {
        issues.push({
          path: issuePath.tab(group.id, tab.id),
          severity: 'warning',
          message: 'Cette URL est déjà présente dans ce modèle.',
        });
      }
      seen.add(check.url);
    }
  }
  issues.push(...syncQuotaIssues(config));
  return issues;
}

const kilobytes = (bytes: number) => `${Math.ceil(bytes / 1024)} Ko`;

/** The configuration is synchronized: it must fit in chrome.storage.sync quotas. */
function syncQuotaIssues(config: Config): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  let total = 0;
  for (const [key, value] of Object.entries(toSyncItems(config))) {
    const bytes = itemBytes(key, value);
    total += bytes;
    if (bytes <= SYNC_QUOTA_BYTES_PER_ITEM) continue;
    const group = config.groups.find((candidate) => groupKey(candidate.id) === key);
    if (key === SETTINGS_KEY || !group) {
      issues.push({
        path: issuePath.groups(),
        severity: 'error',
        message: 'Trop de groupes pour être synchronisés : supprimez-en quelques-uns.',
      });
    } else {
      issues.push({
        path: issuePath.groupTabs(group.id),
        severity: 'error',
        message: `Ce groupe est trop volumineux pour être synchronisé (${kilobytes(bytes)} pour ${kilobytes(SYNC_QUOTA_BYTES_PER_ITEM)} maximum) : répartissez ses onglets dans plusieurs groupes.`,
      });
    }
  }
  if (total > SYNC_QUOTA_BYTES) {
    issues.push({
      path: issuePath.groups(),
      severity: 'error',
      message: `La configuration est trop volumineuse pour être synchronisée (${kilobytes(total)} pour ${kilobytes(SYNC_QUOTA_BYTES)} maximum) : supprimez des groupes ou des onglets.`,
    });
  }
  return issues;
}

export function hasErrors(issues: ConfigIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error');
}

/** Trims names and URLs before persisting. */
export function normalizeConfig(config: Config): Config {
  return {
    ...config,
    groups: config.groups.map((group) => ({
      ...group,
      name: group.name.trim(),
      tabs: group.tabs.map((tab) => ({ ...tab, url: tab.url.trim() })),
    })),
  };
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function parseTab(raw: unknown, where: string): ParseResult<TabTemplate> {
  if (!isRecord(raw)) return { ok: false, error: `${where} : onglet mal formé.` };
  if (!isNonEmptyString(raw.id)) return { ok: false, error: `${where} : identifiant manquant.` };
  if (typeof raw.url !== 'string') return { ok: false, error: `${where} : URL manquante.` };
  return { ok: true, value: { id: raw.id, url: raw.url } };
}

export function parseGroup(raw: unknown, where: string): ParseResult<GroupTemplate> {
  if (!isRecord(raw)) return { ok: false, error: `${where} : modèle mal formé.` };
  if (!isNonEmptyString(raw.id)) return { ok: false, error: `${where} : identifiant manquant.` };
  if (typeof raw.name !== 'string') return { ok: false, error: `${where} : nom manquant.` };
  if (!isGroupColor(raw.color)) return { ok: false, error: `${where} : couleur inconnue.` };
  if (typeof raw.collapsed !== 'boolean' || typeof raw.openOnStartup !== 'boolean') {
    return { ok: false, error: `${where} : options mal formées.` };
  }
  if (!Array.isArray(raw.tabs))
    return { ok: false, error: `${where} : liste d’onglets manquante.` };
  const tabs: TabTemplate[] = [];
  const tabIds = new Set<string>();
  for (const [index, rawTab] of (raw.tabs as unknown[]).entries()) {
    const tab = parseTab(rawTab, `${where}, onglet ${index + 1}`);
    if (!tab.ok) return tab;
    if (tabIds.has(tab.value.id)) {
      return { ok: false, error: `${where} : identifiant d’onglet en double.` };
    }
    tabIds.add(tab.value.id);
    tabs.push(tab.value);
  }
  return {
    ok: true,
    value: {
      id: raw.id,
      name: raw.name,
      color: raw.color,
      collapsed: raw.collapsed,
      openOnStartup: raw.openOnStartup,
      tabs,
    },
  };
}

export function parseGroups(raw: unknown): ParseResult<GroupTemplate[]> {
  if (!Array.isArray(raw)) return { ok: false, error: 'La liste des modèles est mal formée.' };
  const groups: GroupTemplate[] = [];
  const ids = new Set<string>();
  for (const [index, rawGroup] of (raw as unknown[]).entries()) {
    const group = parseGroup(rawGroup, `Modèle ${index + 1}`);
    if (!group.ok) return group;
    if (ids.has(group.value.id)) {
      return { ok: false, error: `Modèle ${index + 1} : identifiant en double.` };
    }
    ids.add(group.value.id);
    groups.push(group.value);
  }
  return { ok: true, value: groups };
}

/** Structural check of stored data. Business rules are checked separately by validateConfig. */
export function parseConfig(raw: unknown): ParseResult<Config> {
  if (!isRecord(raw)) return { ok: false, error: 'La configuration est mal formée.' };
  if (raw.schemaVersion !== SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Version de configuration non prise en charge (${typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 'absente ou invalide'}, attendue : ${SCHEMA_VERSION}).`,
    };
  }
  if (typeof raw.autoLaunchEnabled !== 'boolean') {
    return { ok: false, error: 'Le réglage d’ouverture automatique est mal formé.' };
  }
  const groups = parseGroups(raw.groups);
  if (!groups.ok) return groups;
  return {
    ok: true,
    value: {
      schemaVersion: SCHEMA_VERSION,
      autoLaunchEnabled: raw.autoLaunchEnabled,
      groups: groups.value,
    },
  };
}
