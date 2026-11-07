import type { OperationResult } from '../shared/model';
import { OUTCOME_LABELS, STATUS_LABELS, formatTime } from './api';

export function LastResult({ result }: { result: OperationResult | null }) {
  if (!result) return <p className="muted">Aucune opération pendant cette session.</p>;
  const origin = result.trigger === 'startup' ? 'Démarrage' : 'Ouverture manuelle';
  return (
    <div className={`result result-${result.status}`} role="status">
      <p>
        <strong>{STATUS_LABELS[result.status]}</strong> — {result.message}
      </p>
      <p className="muted small">
        {origin}, {formatTime(result.finishedAt)}
      </p>
      {result.groups.some((group) => group.status !== 'created') && (
        <ul className="small">
          {result.groups.map((group) => (
            <li key={group.templateId}>
              {group.name} : {OUTCOME_LABELS[group.status]}
              {group.detail ? ` — ${group.detail}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
