// Character lists from text files
// You can populate these arrays with character names from your text files

export const EVERMOON_CHARACTERS = {
  achievements: [
    // Add character names from evermoon-achi.txt
    // 'CharacterName1',
    // 'CharacterName2',
  ],
  honorableKills: [
    // Add character names from evermoon-hk.txt
  ],
  playTime: [
    // Add character names from evermoon-playTime.txt
  ]
};

export const TAURI_CHARACTERS = {
  achievements: [
    // Add character names from tauri-achi.txt
  ],
  honorableKills: [
    // Add character names from tauri-hk.txt
  ],
  playTime: [
    // Add character names from tauri-playTime.txt
  ]
};

export const WOD_CHARACTERS = {
  achievements: [
    // Add character names from wod-achi.txt
  ],
  honorableKills: [
    // Add character names from wod-hk.txt
  ],
  playTime: [
    // Add character names from wod-playTime.txt
  ]
};

/**
 * Get all unique characters from the lists above
 */
export function getAllCharactersFromLists() {
  const characters: Array<{ name: string; realm: string; realmApi: string; realmDisplay: string }> = [];

  // Evermoon characters
  [...EVERMOON_CHARACTERS.achievements, ...EVERMOON_CHARACTERS.honorableKills, ...EVERMOON_CHARACTERS.playTime]
    .forEach(name => {
      characters.push({ name, realm: 'Evermoon', realmApi: '[EN] Evermoon', realmDisplay: 'Evermoon' });
    });

  // Tauri characters
  [...TAURI_CHARACTERS.achievements, ...TAURI_CHARACTERS.honorableKills, ...TAURI_CHARACTERS.playTime]
    .forEach(name => {
      characters.push({ name, realm: 'Tauri', realmApi: '[HU] Tauri WoW Server', realmDisplay: 'Tauri' });
    });

  // WoD characters
  [...WOD_CHARACTERS.achievements, ...WOD_CHARACTERS.honorableKills, ...WOD_CHARACTERS.playTime]
    .forEach(name => {
      characters.push({ name, realm: 'WoD', realmApi: '[HU] Warriors of Darkness', realmDisplay: 'WoD' });
    });

  // Remove duplicates
  const seen = new Set<string>();
  return characters.filter(char => {
    const key = `${char.name.toLowerCase()}-${char.realm}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
