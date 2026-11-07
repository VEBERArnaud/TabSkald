import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppState } from '../shared/messages';
import { newGroupTemplate, type GroupTemplate } from '../shared/model';
import { hasErrors, validateConfig, type ConfigIssue } from '../shared/validation';
import { LastResult } from '../ui/LastResult';
import { send } from '../ui/api';
import { GroupEditor, moveItem } from './GroupEditor';
import { ImportPanel } from './ImportPanel';

type Banner = { kind: 'success' | 'error' | 'info'; text: string } | null;

function indexIssues(issues: ConfigIssue[]): Map<string, ConfigIssue[]> {
  const map = new Map<string, ConfigIssue[]>();
  for (const issue of issues) map.set(issue.path, [...(map.get(issue.path) ?? []), issue]);
  return map;
}

export function OptionsApp() {
  const [state, setState] = useState<AppState | null>(null);
  const [draft, setDraft] = useState<GroupTemplate[]>([]);
  const [dirty, setDirty] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const load = useCallback(
    (replaceDraft: boolean) =>
      send({ type: 'getState' }).then((response) => {
        if (!response.ok) {
          setBanner({ kind: 'error', text: response.error });
          return;
        }
        setState(response.data);
        if (replaceDraft && response.data.config) {
          setDraft(response.data.config.groups);
          setDirty(false);
        }
      }),
    [],
  );

  useEffect(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    // Keep in sync with changes made from the popup, without discarding unsaved edits.
    const onChanged = () => void load(!dirty);
    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, [load, dirty]);

  const issues = useMemo(() => {
    const config = state?.config;
    return config ? validateConfig({ ...config, groups: draft }) : [];
  }, [state, draft]);
  const issueMap = useMemo(() => indexIssues(showIssues ? issues : []), [issues, showIssues]);

  function edit(groups: GroupTemplate[]) {
    setDraft(groups);
    setDirty(true);
    setBanner(null);
  }

  async function save() {
    setShowIssues(true);
    if (hasErrors(issues)) {
      setBanner({
        kind: 'error',
        text: 'Certaines valeurs sont invalides : corrigez les champs signalés.',
      });
      return;
    }
    setSaving(true);
    const response = await send({ type: 'saveGroups', groups: draft });
    setSaving(false);
    if (response.ok) {
      setDraft(response.data.groups);
      setDirty(false);
      setState((previous) => (previous ? { ...previous, config: response.data } : previous));
      setBanner({ kind: 'success', text: 'Configuration enregistrée.' });
    } else {
      setBanner({ kind: 'error', text: `Échec de l’enregistrement : ${response.error}` });
    }
  }

  async function setAutoLaunch(enabled: boolean) {
    const response = await send({ type: 'setAutoLaunch', enabled });
    if (response.ok) {
      setState((previous) => (previous ? { ...previous, config: response.data } : previous));
    } else {
      setBanner({ kind: 'error', text: response.error });
    }
  }

  async function reset() {
    const response = await send({ type: 'resetConfig' });
    setConfirmReset(false);
    if (response.ok) {
      await load(true);
      setBanner({ kind: 'success', text: 'Configuration réinitialisée.' });
    } else {
      setBanner({ kind: 'error', text: response.error });
    }
  }

  if (!state) return <main className="options">Chargement…</main>;

  if (!state.config) {
    return (
      <main className="options">
        <h1>TabSkald — Paramètres</h1>
        <p className="banner banner-error">
          La configuration enregistrée ne peut pas être lue : {state.configError} Elle n’a pas été
          modifiée. Copiez-la ci-dessous si vous souhaitez la conserver avant de la réinitialiser.
        </p>
        <textarea readOnly rows={12} value={state.rawConfig ?? ''} />
        <div className="row">
          {confirmReset ? (
            <>
              <span>Remplacer définitivement cette configuration par une configuration vide ?</span>
              <button type="button" className="danger" onClick={() => void reset()}>
                Confirmer
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmReset(false);
                }}
              >
                Annuler
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setConfirmReset(true);
              }}
            >
              Repartir d’une configuration vide
            </button>
          )}
        </div>
        {banner && <p className={`banner banner-${banner.kind}`}>{banner.text}</p>}
      </main>
    );
  }

  return (
    <main className="options">
      <header>
        <h1>TabSkald — Paramètres</h1>
        <p className="muted">
          Tes projets, ouverts et organisés. Les groupes activés sont ajoutés à chaque démarrage de
          Chrome, en plus de vos pages de démarrage habituelles.
        </p>
      </header>

      <section className="card">
        <label className="inline">
          <input
            type="checkbox"
            checked={state.config.autoLaunchEnabled}
            onChange={(event) => void setAutoLaunch(event.target.checked)}
          />
          Ouvrir automatiquement les groupes activés au démarrage de Chrome
        </label>
        <p className="muted small">Ce réglage est enregistré immédiatement.</p>
      </section>

      <section className="groups-section">
        <div className="row">
          <h2>Modèles de groupes</h2>
          <span className="spacer" />
          <button
            type="button"
            onClick={() => {
              edit([...draft, newGroupTemplate()]);
            }}
          >
            Nouveau groupe
          </button>
        </div>

        {draft.length === 0 ? (
          <div className="card empty">
            <p>
              <strong>Aucun modèle pour l’instant.</strong>
            </p>
            <p className="muted">
              Créez un groupe (nom, couleur, URL) ou importez un groupe d’onglets déjà ouvert. Rien
              ne sera ouvert automatiquement tant que vous n’aurez pas enregistré de modèle.
            </p>
            <button
              type="button"
              className="primary"
              onClick={() => {
                edit([newGroupTemplate()]);
              }}
            >
              Créer un premier groupe
            </button>
          </div>
        ) : (
          draft.map((group, index) => (
            <GroupEditor
              key={group.id}
              group={group}
              issues={issueMap}
              isFirst={index === 0}
              isLast={index === draft.length - 1}
              onChange={(updated) => {
                edit(draft.map((g) => (g.id === updated.id ? updated : g)));
              }}
              onMove={(offset) => {
                edit(moveItem(draft, index, offset));
              }}
              onDelete={() => {
                edit(draft.filter((g) => g.id !== group.id));
              }}
            />
          ))
        )}
      </section>

      <ImportPanel
        onImport={(template) => {
          edit([...draft, template]);
          setBanner({
            kind: 'info',
            text: `Modèle « ${template.name} » ajouté : enregistrez pour le conserver.`,
          });
        }}
      />

      <section className="card">
        <h2>Dernière opération</h2>
        <LastResult result={state.lastResult} />
      </section>

      <footer className="save-bar">
        {banner && (
          <p className={`banner banner-${banner.kind}`} role="status">
            {banner.text}
          </p>
        )}
        <div className="row">
          <span className="muted small">
            {dirty ? 'Modifications non enregistrées.' : 'Tout est enregistré.'}
          </span>
          <span className="spacer" />
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => {
              setDraft(state.config?.groups ?? []);
              setDirty(false);
              setShowIssues(false);
              setBanner(null);
            }}
          >
            Annuler les modifications
          </button>
          <button
            type="button"
            className="primary"
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </footer>
    </main>
  );
}
