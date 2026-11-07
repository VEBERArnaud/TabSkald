import { parseRequest } from '../shared/messages';
import { createChromeApi, createChromeStore } from './chromeApi';
import { handleRequest } from './handlers';
import { createOrchestrator } from './orchestrator';
import { migrateLegacyConfig } from './storage';

const api = createChromeApi();
const sync = createChromeStore(chrome.storage.sync);
const local = createChromeStore(chrome.storage.local);
const session = createChromeStore(chrome.storage.session);
const orchestrator = createOrchestrator({ chrome: api, sync, local, session });

function reportUnexpected(error: unknown): void {
  // Only the message is logged, never the configured URLs.
  console.error('[TabSkald]', error instanceof Error ? error.message : String(error));
}

// Listeners are registered synchronously at the top level so that Chrome can deliver
// the event that woke the service worker.

chrome.runtime.onStartup.addListener(() => {
  orchestrator.handleBrowserStartup().catch(reportUnexpected);
});

chrome.runtime.onInstalled.addListener(() => {
  migrateLegacyConfig({ sync, local }).catch(reportUnexpected);
});

chrome.windows.onCreated.addListener(
  (window) => {
    if (window.id === undefined) return;
    orchestrator
      .handleWindowCreated({
        id: window.id,
        focused: window.focused,
        incognito: window.incognito,
        type: window.type ?? 'normal',
      })
      .catch(reportUnexpected);
  },
  { windowTypes: ['normal'] },
);

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  const request = parseRequest(message);
  if (!request) {
    sendResponse({ ok: false, error: 'Message non reconnu.' });
    return false;
  }
  // The operation runs here, in the service worker: if the popup closes, it still completes.
  handleRequest({ chrome: api, sync, local, session, orchestrator }, request)
    .then(sendResponse)
    .catch((error: unknown) => {
      reportUnexpected(error);
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });
  return true;
});

// A wake-up of the service worker never triggers a new opening: it only resumes a
// startup that was interrupted before completion (state kept in storage.session).
orchestrator.resumeStartup().catch(reportUnexpected);
