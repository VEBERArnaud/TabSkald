import { createOrchestrator } from '../src/background/orchestrator';
import type { Config, GroupTemplate } from '../src/shared/model';
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

export function setup(groups: GroupTemplate[], options: { autoLaunchEnabled?: boolean } = {}) {
  const browser = new FakeBrowser();
  const local = new MemoryStore();
  const session = new MemoryStore();
  local.data.set('config', config(groups, options.autoLaunchEnabled ?? true));
  const orchestrator = createOrchestrator({ chrome: browser, local, session, now: () => 1000 });
  /** A new orchestrator sharing storage, as after a service worker restart. */
  const restartWorker = () =>
    createOrchestrator({ chrome: browser, local, session, now: () => 2000 });
  return { browser, chrome: browser, local, session, orchestrator, restartWorker };
}
