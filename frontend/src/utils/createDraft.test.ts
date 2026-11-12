import { afterEach, describe, expect, it } from 'vitest';
import { clearDraft, isBlankDraft, loadDraft, saveDraft } from './createDraft';

const blank = { name: '', description: '', type: 'video' as const, category: '', entries: [{ title: '', mediaUrl: '', titleSource: null }] };

afterEach(() => window.localStorage.clear());

describe('create drafts', () => {
  it('round-trip, and a blank form clears the stored draft', () => {
    saveDraft({ ...blank, name: 'Best covers', entries: [{ title: 'One', mediaUrl: 'https://x.test/1.png', titleSource: 'user' }] }, 42);
    expect(loadDraft()).toEqual({
      ...blank, name: 'Best covers', savedAt: 42, entries: [{ title: 'One', mediaUrl: 'https://x.test/1.png', titleSource: 'user' }],
    });
    saveDraft(blank);
    expect(window.localStorage.getItem('duely:create-draft')).toBeNull();
    expect(loadDraft()).toBeNull();
  });

  it('treats whitespace as blank and can be cleared', () => {
    expect(isBlankDraft({ ...blank, name: '  ', entries: [{ title: ' ', mediaUrl: '', titleSource: null }] })).toBe(true);
    saveDraft({ ...blank, description: 'x' });
    clearDraft();
    expect(loadDraft()).toBeNull();
  });

  it('survives what another version (or a person) left in storage', () => {
    window.localStorage.setItem('duely:create-draft', 'not json');
    expect(loadDraft()).toBeNull();
    window.localStorage.setItem('duely:create-draft', JSON.stringify({
      name: 'Kept', type: 'gif', entries: [{ title: 5, mediaUrl: 'https://x.test/a.png', titleSource: 'robot' }, null],
    }));
    expect(loadDraft()).toMatchObject({
      name: 'Kept', description: '', type: 'video', entries: [{ title: '', mediaUrl: 'https://x.test/a.png', titleSource: null }],
    });
  });
});
