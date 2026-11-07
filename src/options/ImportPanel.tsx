import { useState } from 'react';
import { buildImportDraft, type ImportDraft } from '../shared/importDraft';
import type { OpenGroupSummary } from '../shared/messages';
import { COLOR_LABELS, COLOR_SWATCHES, isGroupColor, type GroupTemplate } from '../shared/model';
import { send } from '../ui/api';

interface Props {
  onImport: (template: GroupTemplate) => void;
}

export function ImportPanel({ onImport }: Props) {
  const [groups, setGroups] = useState<OpenGroupSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ImportDraft | null>(null);

  async function load() {
    setError(null);
    setDraft(null);
    const response = await send({ type: 'listOpenGroups' });
    if (response.ok) setGroups(response.data);
    else setError(response.error);
  }

  return (
    <section className="card import">
      <div className="row">
        <h2>Importer un groupe ouvert</h2>
        <span className="spacer" />
        <button type="button" className="small" onClick={() => void load()}>
          {groups === null ? 'Lister les groupes ouverts' : 'Actualiser'}
        </button>
      </div>
      <p className="muted small">
        Copie ponctuelle : le modèle créé n’est pas synchronisé avec le groupe d’origine.
      </p>
      {error && <p className="field-error">{error}</p>}
      {groups?.length === 0 && <p className="muted">Aucun groupe d’onglets ouvert.</p>}
      {groups && groups.length > 0 && !draft && (
        <ul className="open-groups">
          {groups.map((group) => (
            <li key={group.groupId} className="row">
              <span
                className="swatch"
                style={{
                  background: isGroupColor(group.color)
                    ? COLOR_SWATCHES[group.color]
                    : COLOR_SWATCHES.grey,
                }}
              />
              <span>{group.title || <em className="muted">Sans nom</em>}</span>
              <span className="muted small">
                {group.urls.length} onglet{group.urls.length > 1 ? 's' : ''}
              </span>
              <span className="spacer" />
              <button
                type="button"
                className="small"
                onClick={() => {
                  setDraft(buildImportDraft(group));
                }}
              >
                Prévisualiser
              </button>
            </li>
          ))}
        </ul>
      )}
      {draft && (
        <div className="import-preview">
          <h3>Aperçu</h3>
          <p>
            <strong>{draft.template.name}</strong> — {COLOR_LABELS[draft.template.color]},{' '}
            {draft.template.collapsed ? 'replié' : 'déplié'}, ouverture au démarrage désactivée
            (modifiable ensuite).
          </p>
          <ol className="small">
            {draft.template.tabs.map((tab) => (
              <li key={tab.id}>{tab.url}</li>
            ))}
          </ol>
          {draft.unsupported.length > 0 && (
            <div className="field-warning">
              <p>
                {draft.unsupported.length} URL non prise{draft.unsupported.length > 1 ? 's' : ''} en
                charge, qui ne seront pas importées :
              </p>
              <ul>
                {draft.unsupported.map((item, index) => (
                  <li key={index}>
                    <code>{item.url || '(vide)'}</code> — {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="row">
            <button
              type="button"
              className="primary small"
              onClick={() => {
                onImport(draft.template);
                setDraft(null);
              }}
            >
              Ajouter ce modèle
            </button>
            <button
              type="button"
              className="small"
              onClick={() => {
                setDraft(null);
              }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
