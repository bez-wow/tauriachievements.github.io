import { describe, expect, it } from 'vitest';
import { characterTransitionName } from './motion';

describe('characterTransitionName', () => {
  it('is the same for the same character on every page', () => {
    expect(characterTransitionName('Pretz|Evermoon', 'crest')).toBe(characterTransitionName('Pretz|Evermoon', 'crest'));
  });

  it('tells apart one name on two realms', () => {
    expect(characterTransitionName('Pretz|Evermoon', 'name')).not.toBe(characterTransitionName('Pretz|Tauri', 'name'));
  });

  it('names a character\'s crest and name apart, so each finds its own match', () => {
    expect(characterTransitionName('Pretz|Evermoon', 'crest')).not.toBe(characterTransitionName('Pretz|Evermoon', 'name'));
  });

  it('makes a valid CSS name out of any character name', () => {
    for (const key of ['M#2124685|Evermoon', 'Хранитель|Tauri', 'Straße|WoD']) {
      expect(characterTransitionName(key, 'crest')).toMatch(/^mplus-crest-[0-9a-z]+$/);
    }
  });
});
