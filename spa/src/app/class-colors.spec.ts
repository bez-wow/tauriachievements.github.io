import { describe, expect, it } from 'vitest';
import { CLASS_COLORS, getClassColor, setClassColorProperties } from './class-colors';

describe('CLASS_COLORS', () => {
  it('has a six-digit hex colour for each of the 12 classes', () => {
    for (let classId = 1; classId <= 12; classId++) {
      expect(CLASS_COLORS[classId], `class ${classId}`).toMatch(/^#[0-9a-f]{6}$/);
    }

    expect(Object.keys(CLASS_COLORS)).toHaveLength(12);
  });
});

describe('getClassColor', () => {
  it('returns the class colour, or undefined for an unknown class', () => {
    expect(getClassColor(5)).toBe('#ffffff');
    expect(getClassColor(11)).toBe('#ff7d0a');
    expect(getClassColor(99)).toBeUndefined();
  });
});

describe('setClassColorProperties', () => {
  it('exposes every class colour as a --class-<id> custom property', () => {
    const properties = new Map<string, string>();

    setClassColorProperties({ setProperty: (name: string, value: string | null) => properties.set(name, value ?? '') });

    expect(properties.size).toBe(12);
    expect(properties.get('--class-1')).toBe(CLASS_COLORS[1]);
    expect(properties.get('--class-12')).toBe(CLASS_COLORS[12]);
  });
});
