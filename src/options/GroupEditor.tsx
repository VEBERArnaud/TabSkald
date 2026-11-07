import { useState } from 'react';
import {
  COLOR_LABELS,
  COLOR_SWATCHES,
  GROUP_COLORS,
  isGroupColor,
  newId,
  type GroupTemplate,
} from '../shared/model';
import { issuePath, type ConfigIssue } from '../shared/validation';

interface Props {
  group: GroupTemplate;
  issues: Map<string, ConfigIssue[]>;
  isFirst: boolean;
  isLast: boolean;
  onChange: (group: GroupTemplate) => void;
  onMove: (offset: -1 | 1) => void;
  onDelete: () => void;
}

export function moveItem<T>(items: T[], index: number, offset: -1 | 1): T[] {
  const target = index + offset;
  if (target < 0 || target >= items.length) return items;
  const copy = [...items];
  const [item] = copy.splice(index, 1);
  if (item !== undefined) copy.splice(target, 0, item);
  return copy;
}

export function splitPastedUrls(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

export function FieldIssues({ issues }: { issues: ConfigIssue[] | undefined }) {
  if (!issues) return null;
  return (
    <>
      {issues.map((issue) => (
        <p
          key={issue.message}
          className={issue.severity === 'error' ? 'field-error' : 'field-warning'}
        >
          {issue.message}
        </p>
      ))}
    </>
  );
}

export function GroupEditor({ group, issues, isFirst, isLast, onChange, onMove, onDelete }: Props) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState('');
  const nameIssues = issues.get(issuePath.groupName(group.id));
  const update = (patch: Partial<GroupTemplate>) => {
    onChange({ ...group, ...patch });
  };
  const setTabs = (tabs: GroupTemplate['tabs']) => {
    update({ tabs });
  };

  function addPasted() {
    const urls = splitPastedUrls(pasted);
    if (urls.length === 0) return;
    const kept = group.tabs.filter((tab) => tab.url.trim() !== '');
    setTabs([...kept, ...urls.map((url) => ({ id: newId(), url }))]);
    setPasted('');
    setPasteOpen(false);
  }

  return (
    <article className="card group-editor">
      <div className="row">
        <span className="swatch" style={{ background: COLOR_SWATCHES[group.color] }} />
        <h2 className="group-title">{group.name.trim() || 'Nouveau groupe'}</h2>
        <span className="spacer" />
        <button
          type="button"
          className="small"
          disabled={isFirst}
          onClick={() => {
            onMove(-1);
          }}
        >
          Monter
        </button>
        <button
          type="button"
          className="small"
          disabled={isLast}
          onClick={() => {
            onMove(1);
          }}
        >
          Descendre
        </button>
        <button type="button" className="small danger" onClick={onDelete}>
          Supprimer
        </button>
      </div>

      <div className="grid">
        <label>
          Nom
          <input
            type="text"
            value={group.name}
            aria-invalid={nameIssues?.some((issue) => issue.severity === 'error') ?? false}
            onChange={(event) => {
              update({ name: event.target.value });
            }}
          />
          <FieldIssues issues={nameIssues} />
        </label>
        <label>
          Couleur
          <select
            value={group.color}
            onChange={(event) => {
              if (isGroupColor(event.target.value)) update({ color: event.target.value });
            }}
          >
            {GROUP_COLORS.map((color) => (
              <option key={color} value={color}>
                {COLOR_LABELS[color]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="row options-row">
        <label className="inline">
          <input
            type="checkbox"
            checked={group.openOnStartup}
            onChange={(event) => {
              update({ openOnStartup: event.target.checked });
            }}
          />
          Ouvrir au démarrage
        </label>
        <label className="inline">
          <input
            type="checkbox"
            checked={group.collapsed}
            onChange={(event) => {
              update({ collapsed: event.target.checked });
            }}
          />
          Replié à l’ouverture
        </label>
      </div>

      <h3>URL ({group.tabs.length})</h3>
      <FieldIssues issues={issues.get(issuePath.groupTabs(group.id))} />
      <ol className="tabs">
        {group.tabs.map((tab, index) => {
          const tabIssues = issues.get(issuePath.tab(group.id, tab.id));
          return (
            <li key={tab.id}>
              <div className="row tab-row">
                <input
                  type="url"
                  value={tab.url}
                  placeholder="https://exemple.com"
                  aria-label={`URL ${index + 1}`}
                  aria-invalid={tabIssues?.some((issue) => issue.severity === 'error') ?? false}
                  onChange={(event) => {
                    setTabs(
                      group.tabs.map((t) =>
                        t.id === tab.id ? { ...t, url: event.target.value } : t,
                      ),
                    );
                  }}
                />
                <button
                  type="button"
                  className="small"
                  title="Monter"
                  aria-label="Monter l’URL"
                  disabled={index === 0}
                  onClick={() => {
                    setTabs(moveItem(group.tabs, index, -1));
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="small"
                  title="Descendre"
                  aria-label="Descendre l’URL"
                  disabled={index === group.tabs.length - 1}
                  onClick={() => {
                    setTabs(moveItem(group.tabs, index, 1));
                  }}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="small danger"
                  title="Supprimer"
                  aria-label="Supprimer l’URL"
                  onClick={() => {
                    setTabs(group.tabs.filter((t) => t.id !== tab.id));
                  }}
                >
                  ✕
                </button>
              </div>
              <FieldIssues issues={tabIssues} />
            </li>
          );
        })}
      </ol>
      <div className="row">
        <button
          type="button"
          className="small"
          onClick={() => {
            setTabs([...group.tabs, { id: newId(), url: '' }]);
          }}
        >
          Ajouter une URL
        </button>
        <button
          type="button"
          className="small"
          onClick={() => {
            setPasteOpen(!pasteOpen);
          }}
        >
          Coller plusieurs URL
        </button>
      </div>
      {pasteOpen && (
        <div className="paste">
          <textarea
            rows={5}
            value={pasted}
            placeholder={'Une URL par ligne\nhttps://github.com\nhttps://feedly.com'}
            onChange={(event) => {
              setPasted(event.target.value);
            }}
          />
          <div className="row">
            <button type="button" className="small primary" onClick={addPasted}>
              Ajouter ces URL
            </button>
            <button
              type="button"
              className="small"
              onClick={() => {
                setPasteOpen(false);
              }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
