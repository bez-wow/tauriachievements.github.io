export const getClassIconPath = (classIcon: string | number): string => {
  return `assets/class-icons/${classIcon}.gif`;
};

export const getClassCrestPath = (classId: number): string => {
  return `assets/class-crests/${classId}.webp`;
};

export const getSpecArtPath = (className: string, spec: string): string => {
  return `assets/spec-art/${`${className}-${spec}`.toLowerCase().replace(/ /g, '-')}.webp`;
};
