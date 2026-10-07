export const getClassIconPath = (classIcon: string | number): string => {
  return `assets/class-icons/${classIcon}.gif`;
};

/**
 * The class crest, 256 px square: for a class shown large, where the 18 px icon would blur.
 * From warcraft.wiki.gg's <Class>_Crest.png files.
 */
export const getClassCrestPath = (classId: number): string => {
  return `assets/class-crests/${classId}.webp`;
};
