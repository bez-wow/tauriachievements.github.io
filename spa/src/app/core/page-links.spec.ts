import { describe, expect, it } from 'vitest';
import { mythicPlusProfileLink } from './page-links';

describe('mythicPlusProfileLink', () => {
  it('builds the profile path from the realm slug and the name as it is', () => {
    expect(mythicPlusProfileLink({ name: 'Táncoslány', realm: 'Tauri' }))
      .toEqual(['/mythic-plus', 'character', 'tauri', 'Táncoslány']);
    expect(mythicPlusProfileLink({ name: 'Stronoff', realm: 'WoD' })[2]).toBe('wod');
  });
});
