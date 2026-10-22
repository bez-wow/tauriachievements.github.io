export const CLASS_COLORS: Readonly<Record<number, string>> = {
  1: '#c79c6e',
  2: '#f58cba',
  3: '#abd473',
  4: '#fff569',
  5: '#ffffff',
  6: '#c41f3b',
  7: '#0070de',
  8: '#69ccf0',
  9: '#9482c9',
  10: '#00ff96',
  11: '#ff7d0a',
  12: '#a330c9'
};

export function getClassColor(classId: number): string | undefined {
  return CLASS_COLORS[classId];
}

export function setClassColorProperties(style: Pick<CSSStyleDeclaration, 'setProperty'>): void {
  for (const [classId, color] of Object.entries(CLASS_COLORS)) {
    style.setProperty(`--class-${classId}`, color);
  }
}
