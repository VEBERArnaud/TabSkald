import { createOrchestrator } from '../src/background/orchestrator';
import type { Config, GroupTemplate } from '../src/shared/model';
import { toSyncItems } from '../src/shared/syncLayout';
import { FakeBrowser, MemoryStore } from './fakeChrome';

let counter = 0;

export function template(
  name: string,
  urls: string[],
  overrides: Partial<Omit<GroupTemplate, 'tabs'>> = {},
): GroupTemplate {
  counter++;
  return {
    id: `tpl-${counter}`,
    name,
    color: 'blue',
    collapsed: false,
    openOnStartup: true,
    tabs: urls.map((url, index) => ({ id: `tab-${counter}-${index}`, url })),
    ...overrides,
  };
}

export function config(groups: GroupTemplate[], autoLaunchEnabled = true): Config {
  return { schemaVersion: 1, autoLaunchEnabled, groups };
}

/** Writes a configuration in the sync layout, bypassing validation. */
export function storeConfig(store: MemoryStore, value: Config): void {
  for (const [key, item] of Object.entries(toSyncItems(value))) store.data.set(key, item);
}

export function setup(groups: GroupTemplate[], options: { autoLaunchEnabled?: boolean } = {}) {
  const browser = new FakeBrowser();
  const sync = new MemoryStore();
  const local = new MemoryStore();
  const session = new MemoryStore();
  storeConfig(sync, config(groups, options.autoLaunchEnabled ?? true));
  const orchestrator = createOrchestrator({
    chrome: browser,
    sync,
    local,
    session,
    now: () => 1000,
  });
  /** A new orchestrator sharing storage, as after a service worker restart. */
  const restartWorker = () =>
    createOrchestrator({ chrome: browser, sync, local, session, now: () => 2000 });
  return { browser, chrome: browser, sync, local, session, orchestrator, restartWorker };
}
