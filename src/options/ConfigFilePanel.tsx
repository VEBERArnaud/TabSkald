import { useRef, useState, type ChangeEvent } from 'react';
import { exportFileName, parseConfigFile, serializeConfig } from '../shared/configFile';
import type { Config, GroupTemplate } from '../shared/model';

interface Props {
  /** The saved configuration, which is what gets exported. */
  config: Config;
  dirty: boolean;
  onImport: (groups: GroupTemplate[]) => void;
}

function download(config: Config) {
  const url = URL.createObjectURL(
    new Blob([serializeConfig(config)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = exportFileName(new Date());
  link.click();
  URL.revokeObjectURL(url);
}

export function ConfigFilePanel({ config, dirty, onImport }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Config | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function read(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Reset so that choosing the same file again triggers a new change event.
    input.value = '';
    if (!file) return;
    setPending(null);
    const parsed = parseConfigFile(await file.text());
    if (parsed.ok) {
      setError(null);
      setPending(parsed.config);
    } else {
      setError(parsed.error);
    }
  }

  return (
    <section className="card">
      <h2>Exporter ou importer la configuration</h2>
      <p className="muted small">
        Fichier JSON contenant tous les modèles, pour une sauvegarde ou pour passer d’une
        installation de TabSkald à une autre.
      </p>
      <div className="row">
        <button
          type="button"
          className="small"
          onClick={() => {
            download(config);
          }}
        >
          Exporter
        </button>
        <button
          type="button"
          className="small"
          onClick={() => {
            fileInput.current?.click();
          }}
        >
          Importer un fichier…
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => void read(event)}
        />
      </div>
      {dirty && (
        <p className="muted small">
          L’export contient la configuration enregistrée, sans les modifications en cours.
        </p>
      )}
      {error && <p className="field-error">{error}</p>}
      {pending && (
        <div className="import-preview">
          <p>
            {pending.groups.length === 0
              ? 'Ce fichier ne contient aucun modèle.'
              : `${pending.groups.length} modèle${pending.groups.length > 1 ? 's' : ''} : ${pending.groups.map((group) => group.name).join(', ')}.`}
          </p>
          <p className="muted small">
            Les modèles actuels seront remplacés. L’ouverture automatique n’est pas modifiée. Rien
            n’est enregistré avant que vous cliquiez sur « Enregistrer ».
          </p>
          <div className="row">
            <button
              type="button"
              className="primary small"
              onClick={() => {
                onImport(pending.groups);
                setPending(null);
              }}
            >
              Remplacer les modèles
            </button>
            <button
              type="button"
              className="small"
              onClick={() => {
                setPending(null);
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
