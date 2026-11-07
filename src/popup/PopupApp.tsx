import { useCallback, useEffect, useState } from 'react';
import type { AppState } from '../shared/messages';
import { COLOR_SWATCHES } from '../shared/model';
import { LastResult } from '../ui/LastResult';
import { send } from '../ui/api';

export function PopupApp() {
  const [state, setState] = useState<AppState | null>(null);
  const [windowId, setWindowId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    () =>
      send({ type: 'getState' }).then((response) => {
        if (response.ok) setState(response.data);
        else setError(response.error);
      }),
    [],
  );

  useEffect(() => {
    void send({ type: 'getState' }).then((response) => {
      if (response.ok) setState(response.data);
      else setError(response.error);
    });
    // The popup belongs to the window it was opened from: its id is resolved explicitly.
    chrome.windows
      .getCurrent()
      .then((window) => {
        setWindowId(window.id ?? null);
      })
      .catch(() => {
        setError('Impossible de déterminer la fenêtre courante.');
      });
    const onChanged = () => void refresh();
    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, [refresh]);

  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const response = await action();
    if (!response.ok) setError(response.error ?? 'Erreur inconnue.');
    await refresh();
    setBusy(false);
  }

  const config = state?.config ?? null;
  const startupCount = config?.groups.filter((group) => group.openOnStartup).length ?? 0;
  const canOpen = windowId !== null && !busy;

  return (
    <main>
      <header className="row">
        <h1>TabSkald</h1>
        <span className="spacer" />
        <button
          type="button"
          className="small"
          onClick={() => void chrome.runtime.openOptionsPage()}
        >
          Paramètres
        </button>
      </header>
      <p className="muted small">Tes projets, ouverts et organisés.</p>

      {error && <p className="banner banner-error">{error}</p>}
      {state?.configError && (
        <p className="banner banner-error">
          Configuration illisible : {state.configError} Ouvrez les paramètres pour la corriger.
        </p>
      )}

      {config && (
        <>
          <label className="inline toggle">
            <input
              type="checkbox"
              checked={config.autoLaunchEnabled}
              disabled={busy}
              onChange={(event) =>
                void run(() => send({ type: 'setAutoLaunch', enabled: event.target.checked }))
              }
            />
            Ouverture automatique au démarrage
          </label>

          {config.groups.length === 0 ? (
            <div className="card empty">
              <p>Aucun modèle de groupe pour l’instant.</p>
              <button
                type="button"
                className="primary"
                onClick={() => void chrome.runtime.openOptionsPage()}
              >
                Créer un premier groupe
              </button>
            </div>
          ) : (
            <>
              <ul className="groups">
                {config.groups.map((group) => (
                  <li key={group.id} className="row">
                    <span className="swatch" style={{ background: COLOR_SWATCHES[group.color] }} />
                    <span className="group-name" title={group.name}>
                      {group.name}
                    </span>
                    <span className="muted small">
                      {group.tabs.length} onglet{group.tabs.length > 1 ? 's' : ''}
                      {group.openOnStartup ? '' : ' · manuel'}
                    </span>
                    <span className="spacer" />
                    <button
                      type="button"
                      className="small"
                      disabled={!canOpen || group.tabs.length === 0}
                      onClick={() => {
                        if (windowId === null) return;
                        void run(() => send({ type: 'openGroup', windowId, templateId: group.id }));
                      }}
                    >
                      Ouvrir
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="primary wide"
                disabled={!canOpen || startupCount === 0}
                onClick={() => {
                  if (windowId === null) return;
                  void run(() => send({ type: 'openStartupGroups', windowId }));
                }}
              >
                Ouvrir les groupes de démarrage ({startupCount})
              </button>
            </>
          )}
        </>
      )}

      <section>
        <h2>Dernière opération</h2>
        {busy ? (
          <p className="muted">Ouverture en cours…</p>
        ) : (
          <LastResult result={state?.lastResult ?? null} />
        )}
      </section>
    </main>
  );
}
