import type { BracketType } from '@/types';
import { local } from './storage';

/**
 * The bracket being made, kept in localStorage until it is created or thrown away, so closing the
 * tab, a crash or a sign-in redirect doesn't cost up to 500 entries. One draft per browser.
 */
export interface CreateDraft {
  name: string;
  description: string;
  type: BracketType;
  category: string;
  entries: DraftEntry[];
  /** ms since the epoch. */
  savedAt: number;
}

export interface DraftEntry {
  title: string;
  mediaUrl: string;
  titleSource: 'user' | 'auto' | null;
}

const KEY = 'duely:create-draft';
const TYPES: readonly string[] = ['video', 'song', 'image'];

/** Nothing typed yet: not worth keeping. */
export function isBlankDraft(d: Omit<CreateDraft, 'savedAt'>): boolean {
  return !d.name.trim() && !d.description.trim() && d.entries.every(e => !e.title.trim() && !e.mediaUrl.trim());
}

export function saveDraft(draft: Omit<CreateDraft, 'savedAt'>, now = Date.now()): void {
  if (isBlankDraft(draft)) {
    clearDraft();
  } else {
    local.set(KEY, JSON.stringify({ ...draft, savedAt: now }));
  }
}

export function clearDraft(): void {
  local.remove(KEY);
}

const str = (x: unknown): string => (typeof x === 'string' ? x : '');

/** The stored draft, or null when there is none worth restoring. */
export function loadDraft(): CreateDraft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(local.get(KEY) ?? 'null');
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const d = parsed as Record<string, unknown>;
  const entries: DraftEntry[] = (Array.isArray(d.entries) ? d.entries : [])
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
    .slice(0, 500)
    .map(e => ({
      title: str(e.title),
      mediaUrl: str(e.mediaUrl),
      titleSource: e.titleSource === 'user' || e.titleSource === 'auto' ? e.titleSource : null,
    }));
  const draft: CreateDraft = {
    name: str(d.name),
    description: str(d.description),
    type: TYPES.includes(str(d.type)) ? (d.type as BracketType) : 'video',
    category: str(d.category),
    entries,
    savedAt: typeof d.savedAt === 'number' ? d.savedAt : Date.now(),
  };
  return isBlankDraft(draft) ? null : draft;
}
