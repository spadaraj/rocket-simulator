import { describe, expect, it } from 'vitest';
import { MISSIONS } from '../../missions/missions';
import { furthestOpen, isUnlocked, readSaveCode, saveCode } from '../../missions/progress';

describe('Save codes', () => {
  it('round-trips stars and the grown-up opening', () => {
    const stars: Record<string, number> = {};
    MISSIONS.forEach((m, i) => {
      if (i % 3 !== 2) stars[m.id] = (i % 3) + 1;
    });
    const p = { stars, openTo: 9 };
    const code = saveCode(p);
    expect(code).toMatch(/^Q-[2-9A-Z]{1,4}(-[2-9A-Z]{1,4})*$/);
    expect(readSaveCode(code)).toEqual(p);
  });

  it('is short for a fresh start at Mission 5, and opens missions 1 to 5', () => {
    const code = saveCode({ stars: {}, openTo: 4 });
    expect(code.replace(/-/g, '').length).toBeLessThanOrEqual(5);
    const p = readSaveCode(code)!;
    expect(furthestOpen(p)).toBe(4);
    expect(isUnlocked(p, 4)).toBe(true);
    expect(isUnlocked(p, 5)).toBe(false);
  });

  it('forgives case, spaces and a missing dash', () => {
    const p = { stars: { [MISSIONS[0].id]: 3, [MISSIONS[1].id]: 2 } };
    const code = saveCode(p);
    expect(readSaveCode(`  ${code.toLowerCase().replace(/-/g, ' ')} `)).toEqual(p);
  });

  it('catches a typo', () => {
    const code = saveCode({ stars: { [MISSIONS[0].id]: 3, [MISSIONS[1].id]: 1, [MISSIONS[2].id]: 2 } });
    const last = code[code.length - 2];
    const typo = code.slice(0, -2) + (last === 'A' ? 'B' : 'A') + code.slice(-1);
    expect(readSaveCode(typo)).toBeNull();
    expect(readSaveCode('hello')).toBeNull();
    expect(readSaveCode('')).toBeNull();
  });
});
