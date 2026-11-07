import type { Request, Response, ResponseData } from '../shared/messages';
import type { OperationResult } from '../shared/model';

/** Typed request to the service worker, which owns every operation. */
export async function send<K extends Request['type']>(
  request: Extract<Request, { type: K }>,
): Promise<Response<ResponseData[K]>> {
  try {
    const response = await chrome.runtime.sendMessage<
      Request,
      Response<ResponseData[K]> | undefined
    >(request);
    return response ?? { ok: false, error: 'Aucune réponse du service worker.' };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export const STATUS_LABELS: Record<OperationResult['status'], string> = {
  success: 'Succès',
  partial: 'Succès partiel',
  error: 'Erreur',
  skipped: 'Rien à faire',
};

export const OUTCOME_LABELS: Record<OperationResult['groups'][number]['status'], string> = {
  created: 'ouvert',
  partial: 'ouvert partiellement',
  alreadyOpen: 'déjà ouvert',
  recognized: 'déjà présent',
  conflict: 'conflit',
  failed: 'échec',
};

export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
