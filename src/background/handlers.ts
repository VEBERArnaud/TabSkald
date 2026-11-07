import type { OpenGroupSummary, Request, Response, ResponseData } from '../shared/messages';
import { emptyConfig } from '../shared/model';
import type { ChromeApi, KeyValueStore } from './chromeApi';
import { groupOpenTabs } from './matching';
import { isUsableWindow, type Orchestrator } from './orchestrator';
import { loadConfig, readLastResult, saveConfig, type ConfigStores } from './storage';

export interface HandlerDeps extends ConfigStores {
  chrome: ChromeApi;
  session: KeyValueStore;
  orchestrator: Orchestrator;
}

const ok = <T>(data: T): Response<T> => ({ ok: true, data });

const UNREADABLE_CONFIG =
  'La configuration enregistrée est illisible : corrigez-la ou réinitialisez-la depuis les paramètres.';

async function listOpenGroups(chrome: ChromeApi): Promise<OpenGroupSummary[]> {
  const windows = (await chrome.getNormalWindows()).filter(isUsableWindow);
  const summaries: OpenGroupSummary[] = [];
  for (const window of windows) {
    const [groups, tabs] = await Promise.all([
      chrome.queryGroups({ windowId: window.id }),
      chrome.queryTabs({ windowId: window.id }),
    ]);
    for (const { group, urls } of groupOpenTabs(groups, tabs)) {
      summaries.push({
        groupId: group.id,
        windowId: group.windowId,
        title: group.title,
        color: group.color,
        collapsed: group.collapsed,
        urls,
      });
    }
  }
  return summaries;
}

export async function handleRequest(
  deps: HandlerDeps,
  request: Request,
): Promise<Response<ResponseData[keyof ResponseData]>> {
  const { session, orchestrator } = deps;
  switch (request.type) {
    case 'getState': {
      const [load, lastResult] = await Promise.all([loadConfig(deps), readLastResult(session)]);
      return ok(
        load.ok
          ? {
              config: load.config,
              configError: null,
              rawConfig: null,
              issues: load.issues,
              lastResult: lastResult ?? null,
            }
          : {
              config: null,
              configError: load.error,
              rawConfig: JSON.stringify(load.raw, null, 2),
              issues: [],
              lastResult: lastResult ?? null,
            },
      );
    }
    case 'saveGroups': {
      // Only groups come from the editor: the global switch keeps its current value.
      const load = await loadConfig(deps);
      if (!load.ok) return { ok: false, error: UNREADABLE_CONFIG };
      const saved = await saveConfig(deps, { ...load.config, groups: request.groups });
      return saved.ok ? ok(saved.config) : { ok: false, error: saved.error, issues: saved.issues };
    }
    case 'setAutoLaunch': {
      const load = await loadConfig(deps);
      if (!load.ok) return { ok: false, error: UNREADABLE_CONFIG };
      const saved = await saveConfig(deps, { ...load.config, autoLaunchEnabled: request.enabled });
      return saved.ok ? ok(saved.config) : { ok: false, error: saved.error, issues: saved.issues };
    }
    case 'resetConfig': {
      const saved = await saveConfig(deps, emptyConfig());
      return saved.ok
        ? ok(saved.config)
        : { ok: false, error: `Réinitialisation impossible : ${saved.error}` };
    }
    case 'openGroup':
      return ok(
        await orchestrator.openManually(request.windowId, {
          kind: 'template',
          templateId: request.templateId,
        }),
      );
    case 'openStartupGroups':
      return ok(await orchestrator.openManually(request.windowId, { kind: 'startupGroups' }));
    case 'listOpenGroups':
      return ok(await listOpenGroups(deps.chrome));
  }
}
