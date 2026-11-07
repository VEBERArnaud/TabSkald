import type {
  GroupOutcome,
  GroupTemplate,
  OperationResult,
  OperationStatus,
} from '../shared/model';
import { hasErrors, type ConfigIssue } from '../shared/validation';
import type { ChromeApi, KeyValueStore, WindowInfo } from './chromeApi';
import { classifyOpenGroups, groupOpenTabs, type OpenGroup } from './matching';
import {
  loadConfig,
  readManaged,
  readStartup,
  writeLastResult,
  writeManaged,
  writeStartup,
  type ConfigStores,
  type ManagedGroup,
} from './storage';

export interface OrchestratorDeps extends ConfigStores {
  chrome: ChromeApi;
  session: KeyValueStore;
  now?: () => number;
}

export type ManualSelection = { kind: 'template'; templateId: string } | { kind: 'startupGroups' };

type Trigger = OperationResult['trigger'];

export function isUsableWindow(window: WindowInfo): boolean {
  return window.type === 'normal' && !window.incognito;
}

/** Prefers the focused normal window, then the lowest id for a deterministic choice. */
export function pickStartupWindow(windows: WindowInfo[]): WindowInfo | undefined {
  const usable = windows.filter(isUsableWindow).sort((a, b) => a.id - b.id);
  return usable.find((window) => window.focused) ?? usable[0];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

export function summarize(
  trigger: Trigger,
  outcomes: GroupOutcome[],
  now: number,
): OperationResult {
  const count = (...statuses: GroupOutcome['status'][]) =>
    outcomes.filter((outcome) => statuses.includes(outcome.status)).length;
  const opened = count('created', 'partial');
  const present = count('alreadyOpen', 'recognized');
  const conflicts = count('conflict');
  const failed = count('failed');

  if (outcomes.length === 0) {
    return {
      trigger,
      status: 'skipped',
      finishedAt: now,
      message: 'Aucun groupe à ouvrir.',
      groups: [],
    };
  }
  let status: OperationStatus = 'success';
  if (failed === outcomes.length) status = 'error';
  else if (failed > 0 || conflicts > 0 || count('partial') > 0) status = 'partial';

  const parts: string[] = [];
  if (opened > 0) parts.push(plural(opened, 'groupe ouvert', 'groupes ouverts'));
  if (present > 0) parts.push(plural(present, 'groupe déjà présent', 'groupes déjà présents'));
  if (conflicts > 0) parts.push(plural(conflicts, 'conflit', 'conflits'));
  if (failed > 0) parts.push(plural(failed, 'échec', 'échecs'));
  return { trigger, status, finishedAt: now, message: `${parts.join(', ')}.`, groups: outcomes };
}

function failure(trigger: Trigger, message: string, now: number): OperationResult {
  return { trigger, status: 'error', finishedAt: now, message, groups: [] };
}

function templateIssues(issues: ConfigIssue[], templateId: string): ConfigIssue[] {
  return issues.filter((issue) => issue.path.startsWith(`groups.${templateId}.`));
}

export function createOrchestrator(deps: OrchestratorDeps) {
  const { chrome, session } = deps;
  const now = deps.now ?? Date.now;

  // Every opening goes through this queue, so a double click or two concurrent events
  // are processed one after the other and the second sees what the first created.
  let queue: Promise<unknown> = Promise.resolve();
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  }

  /** Drops entries whose group no longer exists and refreshes their window. */
  async function refreshManaged(entries: ManagedGroup[]): Promise<ManagedGroup[]> {
    const alive: ManagedGroup[] = [];
    for (const entry of entries) {
      const group = await chrome.getGroup(entry.groupId);
      if (group) alive.push({ ...entry, windowId: group.windowId });
    }
    return alive;
  }

  async function readOpenGroups(windowIds: number[]): Promise<OpenGroup[]> {
    const result: OpenGroup[] = [];
    for (const windowId of windowIds) {
      const [groups, tabs] = await Promise.all([
        chrome.queryGroups({ windowId }),
        chrome.queryTabs({ windowId }),
      ]);
      result.push(...groupOpenTabs(groups, tabs));
    }
    return result;
  }

  async function openTemplate(
    template: GroupTemplate,
    windowId: number,
    trigger: Trigger,
    managed: ManagedGroup[],
  ): Promise<GroupOutcome> {
    const base = { templateId: template.id, name: template.name };
    const properties = {
      title: template.name,
      color: template.color,
      collapsed: template.collapsed,
    };

    // 1. A group TabSkald opened during this browser session is still there.
    const tracked =
      managed.find((entry) => entry.templateId === template.id && entry.windowId === windowId) ??
      (trigger === 'startup'
        ? managed.find((entry) => entry.templateId === template.id)
        : undefined);
    if (tracked) {
      if (!tracked.styled) {
        try {
          await chrome.updateGroup(tracked.groupId, properties);
          tracked.styled = true;
          return {
            ...base,
            status: 'alreadyOpen',
            detail: 'Nom, couleur et état appliqués au groupe existant.',
          };
        } catch (error) {
          return {
            ...base,
            status: 'partial',
            detail: `Groupe présent, mise en forme impossible : ${errorMessage(error)}`,
          };
        }
      }
      return { ...base, status: 'alreadyOpen' };
    }

    // 2. Conservative recognition of groups not tracked, e.g. restored by Chrome.
    const scope =
      trigger === 'startup'
        ? (await chrome.getNormalWindows()).filter(isUsableWindow).map((window) => window.id)
        : [windowId];
    const trackedGroupIds = new Set(managed.map((entry) => entry.groupId));
    const candidates = (await readOpenGroups(scope)).filter(
      (open) => !trackedGroupIds.has(open.group.id),
    );
    const { exact, similar } = classifyOpenGroups(template, candidates);
    const [match] = exact;
    if (match && exact.length === 1) {
      managed.push({
        templateId: template.id,
        windowId: match.windowId,
        groupId: match.id,
        styled: true,
      });
      return { ...base, status: 'recognized', detail: 'Un groupe identique était déjà ouvert.' };
    }
    if (exact.length > 1) {
      return {
        ...base,
        status: 'conflict',
        detail:
          'Plusieurs groupes identiques sont déjà ouverts : aucun groupe supplémentaire créé.',
      };
    }
    if (similar.length > 0 && trigger === 'startup') {
      return {
        ...base,
        status: 'conflict',
        detail:
          'Un groupe portant ce nom existe déjà avec un contenu différent : il a été conservé et aucun doublon n’a été créé. Vous pouvez l’ouvrir manuellement.',
      };
    }

    // 3. Creation, appended after the tabs already present.
    if (!(await chrome.getWindow(windowId))) {
      return { ...base, status: 'failed', detail: 'La fenêtre cible a été fermée.' };
    }
    if (template.tabs.length === 0) {
      return { ...base, status: 'failed', detail: 'Ce modèle ne contient aucune URL.' };
    }
    const createdTabIds: number[] = [];
    let failedTabs = 0;
    for (const tab of template.tabs) {
      try {
        createdTabIds.push((await chrome.createTab(windowId, tab.url)).id);
      } catch {
        failedTabs++;
        if (!(await chrome.getWindow(windowId))) {
          return {
            ...base,
            status: 'failed',
            detail: 'La fenêtre cible a été fermée pendant l’ouverture.',
          };
        }
      }
    }
    if (createdTabIds.length === 0) {
      return { ...base, status: 'failed', detail: 'Aucun onglet n’a pu être créé.' };
    }

    let groupId: number;
    try {
      groupId = await chrome.groupTabs(windowId, createdTabIds);
    } catch (error) {
      // Only the tabs created a moment ago by this operation are closed.
      await chrome.removeTabs(createdTabIds).catch(() => undefined);
      return {
        ...base,
        status: 'failed',
        detail: `Regroupement impossible (${errorMessage(error)}) ; les onglets créés ont été refermés.`,
      };
    }
    const entry: ManagedGroup = { templateId: template.id, windowId, groupId, styled: false };
    managed.push(entry);
    await writeManaged(session, managed);

    const problems: string[] = [];
    if (failedTabs > 0) {
      problems.push(
        plural(failedTabs, 'onglet n’a pas pu être créé', 'onglets n’ont pas pu être créés'),
      );
    }
    try {
      await chrome.updateGroup(groupId, properties);
      entry.styled = true;
    } catch (error) {
      problems.push(
        `mise en forme impossible (${errorMessage(error)}) ; relancez l’ouverture pour réessayer`,
      );
    }
    if (problems.length > 0)
      return { ...base, status: 'partial', detail: `${problems.join(' ; ')}.` };
    if (similar.length > 0) {
      return {
        ...base,
        status: 'created',
        detail: 'Un autre groupe portant ce nom était déjà ouvert.',
      };
    }
    return { ...base, status: 'created' };
  }

  /** Opens templates one by one: an error on one group does not prevent the others. */
  async function openTemplates(
    templates: GroupTemplate[],
    windowId: number,
    trigger: Trigger,
  ): Promise<OperationResult> {
    const managed = await refreshManaged(await readManaged(session));
    await writeManaged(session, managed);
    const outcomes: GroupOutcome[] = [];
    for (const template of templates) {
      try {
        outcomes.push(await openTemplate(template, windowId, trigger, managed));
      } catch (error) {
        outcomes.push({
          templateId: template.id,
          name: template.name,
          status: 'failed',
          detail: errorMessage(error),
        });
      }
      await writeManaged(session, managed);
    }
    return summarize(trigger, outcomes, now());
  }

  async function finishStartup(result: OperationResult): Promise<OperationResult> {
    await writeLastResult(session, result);
    await writeStartup(session, 'done');
    return result;
  }

  async function runStartup(): Promise<OperationResult | undefined> {
    try {
      const load = await loadConfig(deps);
      if (!load.ok)
        return await finishStartup(
          failure('startup', `Configuration invalide : ${load.error}`, now()),
        );
      if (hasErrors(load.issues)) {
        return await finishStartup(
          failure(
            'startup',
            'La configuration contient des erreurs : corrigez-la dans les paramètres.',
            now(),
          ),
        );
      }
      const { config } = load;
      if (!config.autoLaunchEnabled) {
        return await finishStartup({
          trigger: 'startup',
          status: 'skipped',
          finishedAt: now(),
          message: 'Ouverture automatique désactivée.',
          groups: [],
        });
      }
      const templates = config.groups.filter((group) => group.openOnStartup);
      if (templates.length === 0) return await finishStartup(summarize('startup', [], now()));

      const window = pickStartupWindow(await chrome.getNormalWindows());
      if (!window) {
        // Handled later by onWindowCreated, or by the next service worker wake-up.
        await writeStartup(session, 'waitingForWindow');
        return undefined;
      }
      await writeStartup(session, 'running');
      return await finishStartup(await openTemplates(templates, window.id, 'startup'));
    } catch (error) {
      return finishStartup(failure('startup', `Erreur inattendue : ${errorMessage(error)}`, now()));
    }
  }

  async function runManual(windowId: number, selection: ManualSelection): Promise<OperationResult> {
    const window = await chrome.getWindow(windowId);
    if (!window) return failure('manual', 'Fenêtre introuvable.', now());
    if (!isUsableWindow(window)) {
      return failure(
        'manual',
        'Les groupes ne peuvent être ouverts que dans une fenêtre normale non privée.',
        now(),
      );
    }
    const load = await loadConfig(deps);
    if (!load.ok) return failure('manual', `Configuration invalide : ${load.error}`, now());

    let templates: GroupTemplate[];
    if (selection.kind === 'template') {
      const template = load.config.groups.find((group) => group.id === selection.templateId);
      if (!template)
        return failure(
          'manual',
          'Modèle introuvable : la configuration a peut-être changé.',
          now(),
        );
      if (hasErrors(templateIssues(load.issues, template.id))) {
        return failure('manual', `Le modèle « ${template.name} » contient des erreurs.`, now());
      }
      if (template.tabs.length === 0) {
        return failure('manual', `Le modèle « ${template.name} » ne contient aucune URL.`, now());
      }
      templates = [template];
    } else {
      if (hasErrors(load.issues)) {
        return failure(
          'manual',
          'La configuration contient des erreurs : corrigez-la dans les paramètres.',
          now(),
        );
      }
      templates = load.config.groups.filter((group) => group.openOnStartup);
    }
    return openTemplates(templates, windowId, 'manual');
  }

  return {
    /** chrome.runtime.onStartup: the only trigger of an automatic opening. */
    handleBrowserStartup(): Promise<OperationResult | undefined> {
      return enqueue(async () => {
        await writeStartup(session, 'pending');
        return runStartup();
      });
    },

    /** Service worker wake-up: resumes an interrupted startup, never starts a new one. */
    resumeStartup(): Promise<OperationResult | undefined> {
      return enqueue(async () => {
        const startup = await readStartup(session);
        if (!startup || startup.status === 'done') return undefined;
        return runStartup();
      });
    },

    /** chrome.windows.onCreated: only serves a startup waiting for a window. */
    handleWindowCreated(window: WindowInfo): Promise<OperationResult | undefined> {
      return enqueue(async () => {
        if (!isUsableWindow(window)) return undefined;
        const startup = await readStartup(session);
        if (startup?.status !== 'waitingForWindow') return undefined;
        return runStartup();
      });
    },

    openManually(windowId: number, selection: ManualSelection): Promise<OperationResult> {
      return enqueue(async () => {
        let result: OperationResult;
        try {
          result = await runManual(windowId, selection);
        } catch (error) {
          result = failure('manual', `Erreur inattendue : ${errorMessage(error)}`, now());
        }
        await writeLastResult(session, result);
        return result;
      });
    },
  };
}

export type Orchestrator = ReturnType<typeof createOrchestrator>;
