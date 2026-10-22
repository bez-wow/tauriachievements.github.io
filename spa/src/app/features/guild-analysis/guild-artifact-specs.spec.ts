import { describe, it, expect } from 'vitest';
import { artifactSpecTraits } from './guild-artifact-specs';

describe('artifactSpecTraits', () => {
  it('lists owned artifacts by traits, then the locked specs in game order', () => {
    const entries = artifactSpecTraits({
      class: 11,
      specialization: 'Feral',
      artifactTraits: 29,
      artifacts: [
        { specialization: 'Balance', name: 'Scythe of Elune', traits: 17 },
        { specialization: 'Feral', name: 'Fangs of Ashamane', traits: 29 }
      ]
    });

    expect(entries.map(entry => [entry.spec, entry.traits])).toEqual([
      ['Feral', 29],
      ['Balance', 17],
      ['Guardian', null],
      ['Restoration', null]
    ]);
    expect(entries[0].icon).toContain('ability_druid_catform');
  });

  it('breaks ties in the game spec order', () => {
    const entries = artifactSpecTraits({
      class: 10,
      specialization: 'Mistweaver',
      artifactTraits: 26,
      artifacts: [
        { specialization: 'Windwalker', name: 'Fists of the Heavens', traits: 26 },
        { specialization: 'Brewmaster', name: "Fu Zan, the Wanderer's Companion", traits: 26 }
      ]
    });

    expect(entries.map(entry => entry.spec)).toEqual(['Brewmaster', 'Windwalker', 'Mistweaver']);
  });

  it('shows every spec as locked when the character owns no artifact', () => {
    const entries = artifactSpecTraits({ class: 12, specialization: '', artifactTraits: 0, artifacts: [] });

    expect(entries.map(entry => [entry.spec, entry.traits])).toEqual([['Havoc', null], ['Vengeance', null]]);
  });

  it('falls back to the best artifact alone for files exported before artifacts were listed', () => {
    const entries = artifactSpecTraits({ class: 8, specialization: 'Fire', artifactTraits: 29 });

    expect(entries.map(entry => [entry.spec, entry.traits])).toEqual([['Fire', 29]]);
  });
});
