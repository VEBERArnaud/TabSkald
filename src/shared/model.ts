export const SCHEMA_VERSION = 1;

/** Colors offered by chrome.tabGroups.Color. */
export const GROUP_COLORS = [
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange',
] as const;

export type GroupColor = (typeof GROUP_COLORS)[number];

export const COLOR_LABELS: Record<GroupColor, string> = {
  grey: 'Gris',
  blue: 'Bleu',
  red: 'Rouge',
  yellow: 'Jaune',
  green: 'Vert',
  pink: 'Rose',
  purple: 'Violet',
  cyan: 'Cyan',
  orange: 'Orange',
};

/** Approximate rendering of Chrome's group colors, for the UI only. */
export const COLOR_SWATCHES: Record<GroupColor, string> = {
  grey: '#5f6368',
  blue: '#1a73e8',
  red: '#d93025',
  yellow: '#f9ab00',
  green: '#188038',
  pink: '#d01884',
  purple: '#a142f4',
  cyan: '#007b83',
  orange: '#fa903e',
};

export interface TabTemplate {
  /** Stable id used by the editor, unrelated to Chrome tab ids. */
  id: string;
  url: string;
}

export interface GroupTemplate {
  /** Stable TabSkald id, unrelated to Chrome group ids. */
  id: string;
  name: string;
  color: GroupColor;
  collapsed: boolean;
  openOnStartup: boolean;
  tabs: TabTemplate[];
}

export interface Config {
  schemaVersion: typeof SCHEMA_VERSION;
  autoLaunchEnabled: boolean;
  groups: GroupTemplate[];
}

export function newId(): string {
  return crypto.randomUUID();
}

export function emptyConfig(): Config {
  return { schemaVersion: SCHEMA_VERSION, autoLaunchEnabled: true, groups: [] };
}

export function newGroupTemplate(): GroupTemplate {
  return {
    id: newId(),
    name: '',
    color: 'blue',
    collapsed: false,
    openOnStartup: true,
    tabs: [{ id: newId(), url: '' }],
  };
}

export function isGroupColor(value: unknown): value is GroupColor {
  return typeof value === 'string' && (GROUP_COLORS as readonly string[]).includes(value);
}

export type GroupOutcomeStatus =
  'created' | 'partial' | 'alreadyOpen' | 'recognized' | 'conflict' | 'failed';

export interface GroupOutcome {
  templateId: string;
  name: string;
  status: GroupOutcomeStatus;
  /** Human readable detail, in French. Never contains full URLs. */
  detail?: string;
}

export type OperationStatus = 'success' | 'partial' | 'error' | 'skipped';

export interface OperationResult {
  trigger: 'startup' | 'manual';
  status: OperationStatus;
  finishedAt: number;
  message: string;
  groups: GroupOutcome[];
}
