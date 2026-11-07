import type { Config } from './model';
import { parseConfig } from './validation';

/** The exported file is the configuration itself, in the stored schema. */
export function serializeConfig(config: Config): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export function exportFileName(date: Date): string {
  return `tabskald-${date.toISOString().slice(0, 10)}.json`;
}

export type ConfigFileParse = { ok: true; config: Config } | { ok: false; error: string };

/** Structural check only: business rules are checked when the imported groups are saved. */
export function parseConfigFile(text: string): ConfigFileParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Ce fichier n’est pas un fichier JSON valide.' };
  }
  const parsed = parseConfig(raw);
  return parsed.ok
    ? { ok: true, config: parsed.value }
    : { ok: false, error: `Fichier non importable. ${parsed.error}` };
}
